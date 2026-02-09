import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   DOCUMENT VARIANTS
===================================================== */

const VARIANTS = {
  HIGH_SCHOOL_TRANSCRIPT: {
    V1: "Strong academic performance",
    V2: "Average academic performance",
    V3: "Low performance with failed subjects",
    V4: "Incomplete transcript"
  },
  COLLEGE_TRANSCRIPT: {
    V1: "High GPA, no backlogs",
    V2: "Low GPA with multiple backlogs",
    V3: "Moderate GPA with limited backlogs",
    V4: "Under verification"
  },
  DEGREE_CERTIFICATE: {
    V1: "Completed with honors",
    V2: "Completed",
    V3: "Completed and verified",
    V4: "Pending verification"
  }
};

/* =====================================================
   UTILS
===================================================== */

function isApplicationIntake(payload) {
  return (
    payload?.ActivityEventName === "Application Intake" ||
    payload?.ActivityEvent === "212"
  );
}

function normalizeEnglishRequirement({ country, citizenship }) {
  const c = (country || "").toLowerCase();
  const cs = (citizenship || "").toLowerCase();

  if (
    cs.includes("us citizen") ||
    cs.includes("permanent resident") ||
    c.includes("united states") ||
    c.includes("usa")
  ) {
    return "NOT REQUIRED (EXEMPT)";
  }

  return "REQUIRED";
}

/* =====================================================
   TRANSFORM PAYLOAD
===================================================== */

function transformLeadSquaredPayload(ls) {
  const c = ls.Current || {};

  const englishRequirement = normalizeEnglishRequirement({
    country: c.mx_Country,
    citizenship: c.mx_Custom_1
  });

  return {
    Lead: {
      Email: c.EmailAddress || "",
      Phone: c.Phone || "",
      Country: c.mx_Country || "Not provided",
      Citizenship: c.mx_Custom_1 || "Not provided"
    },
    Program: {
      Level: c.mx_Program_Level || "Not specified",
      Name: c.mx_Program_Name || "Not specified"
    },
    Academics: {
      HighSchool: VARIANTS.HIGH_SCHOOL_TRANSCRIPT[c.mx_High_School_Transcript_Variant] || "Not submitted",
      College: VARIANTS.COLLEGE_TRANSCRIPT[c.mx_College_Transcript_Variant] || "Not submitted",
      Degree: VARIANTS.DEGREE_CERTIFICATE[c.mx_Degree_Certificate_Variant] || "Not submitted"
    },
    English: {
      Requirement: englishRequirement,
      Variant: c.mx_English_Proficiency_Variant || "N/A"
    }
  };
}

/* =====================================================
   BUILD CONTEXT
===================================================== */

function buildContext(p) {
  return `
APPLICANT OVERVIEW
Country: ${p.Lead.Country}
Citizenship: ${p.Lead.Citizenship}

PROGRAM
Program Name: ${p.Program.Name}
Program Level: ${p.Program.Level}

ACADEMICS
High School Transcript: ${p.Academics.HighSchool}
College Transcript: ${p.Academics.College}
Degree Certificate: ${p.Academics.Degree}

ENGLISH PROFICIENCY
Requirement: ${p.English.Requirement}
Status: ${p.English.Variant}

IMPORTANT:
- If Requirement = NOT REQUIRED (EXEMPT), DO NOT flag missing English documents.
- Missing documents should only be flagged if explicitly required.
`;
}

/* =====================================================
   RUN QA
===================================================== */

async function runQA(context) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: "Return STRICT JSON only." },
      { role: "user", content: context }
    ]
  });

  let result = {};
  try {
    result = JSON.parse(response.choices[0].message.content);
  } catch {
    result = {};
  }

  return {
    QA_Status: result.QA_Status || "REVIEW",
    QA_Risk_Level: result.QA_Risk_Level || "MEDIUM",
    QA_Key_Findings: result.QA_Key_Findings || [],
    QA_Concerns: result.QA_Concerns || [],
    QA_Summary: result.QA_Summary || "QA completed.",
    QA_Advisory_Notes: result.QA_Advisory_Notes || "Review application details."
  };
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  const payload = req.body || {};

  // 🚫 Ignore sync pings
  if (!isApplicationIntake(payload)) {
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }

  try {
    const transformed = transformLeadSquaredPayload(payload);
    const context = buildContext(transformed);
    const qa = await runQA(context);

    return res.status(200).json({
      status: "INTAKE_QA_COMPLETED",
      ...qa
    });
  } catch (err) {
    return res.status(200).json({
      status: "INTAKE_QA_FAILED",
      error: err.message
    });
  }
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✓ Intake QA Agent running on port ${PORT}`)
);
