import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   CONSTANTS
===================================================== */

const ENGLISH_SPEAKING_COUNTRIES = new Set([
  "UNITED STATES",
  "USA",
  "UNITED KINGDOM",
  "UK",
  "ENGLAND",
  "SCOTLAND",
  "WALES",
  "IRELAND",
  "CANADA",
  "AUSTRALIA",
  "NEW ZEALAND"
]);

/* =====================================================
   MOCK DOCUMENT VARIANTS
===================================================== */

const VARIANTS = {
  HIGH_SCHOOL_TRANSCRIPT: {
    V1: "Strong academic performance with consistent grades.",
    V2: "Average performance with no disciplinary issues.",
    V3: "Low performance with multiple failed subjects.",
    V4: "Incomplete transcript with missing semesters."
  },
  COLLEGE_TRANSCRIPT: {
    V1: "High GPA with no backlogs.",
    V2: "Low GPA with multiple backlogs and gap years.",
    V3: "Moderate GPA with limited backlogs.",
    V4: "Transcript submitted but under verification."
  },
  DEGREE_CERTIFICATE: {
    V1: "Degree completed with honors.",
    V2: "Degree completed.",
    V3: "Degree completed and verified.",
    V4: "Degree certificate pending verification."
  },
  YES_NO: {
    Positive: "Requirement met.",
    Negative: "Requirement not met."
  }
};

/* =====================================================
   HELPERS
===================================================== */

function normalize(value) {
  return (value || "").toString().trim().toUpperCase();
}

function isEnglishRequired(citizenship, country) {
  const ctz = normalize(citizenship);
  const ctr = normalize(country);

  if (ctz === "US CITIZEN" || ctz === "PERMANENT RESIDENT") {
    return false;
  }

  if (ENGLISH_SPEAKING_COUNTRIES.has(ctr)) {
    return false;
  }

  return true;
}

/* =====================================================
   TRANSFORM LEADSQUARED PAYLOAD
===================================================== */

function transformLeadSquaredPayload(lsPayload) {
  const current = lsPayload.Current || {};

  const englishRequired = isEnglishRequired(
    current.mx_Custom_1,
    current.mx_Country
  );

  return {
    Lead: {
      FirstName: current.FirstName || "",
      LastName: current.LastName || "",
      Email: current.mx_Student_Email_ID || current.EmailAddress || "",
      Phone: current.Phone || "",
      Country: current.mx_Country || ""
    },
    Activity: {
      ProgramLevel: current.mx_Program_Level || "",
      CitizenshipStatus: current.mx_Custom_1 || "",
      EnglishRequired: englishRequired
    },
    Variants: {
      HighSchool: current.mx_High_School_Transcript_Variant,
      College: current.mx_College_Transcript_Variant,
      Degree: current.mx_Degree_Certificate_Variant,
      English: current.mx_English_Proficiency_Variant
    }
  };
}

/* =====================================================
   BUILD CONTEXT (CRITICAL FIX HERE)
===================================================== */

function buildApplicantContext(payload) {
  const { Lead, Activity, Variants } = payload;

  let context = `
APPLICANT PROFILE
Name: ${Lead.FirstName} ${Lead.LastName}
Email: ${Lead.Email}
Phone: ${Lead.Phone}
Country of Residence: ${Lead.Country}

PROGRAM
Program Level: ${Activity.ProgramLevel}

CITIZENSHIP
Citizenship Status: ${Activity.CitizenshipStatus}

DOCUMENT STATUS
High School Transcript: ${VARIANTS.HIGH_SCHOOL_TRANSCRIPT[Variants.HighSchool] || "Not submitted"}
College Transcript: ${VARIANTS.COLLEGE_TRANSCRIPT[Variants.College] || "Not submitted"}
Degree Certificate: ${VARIANTS.DEGREE_CERTIFICATE[Variants.Degree] || "Not submitted"}
`;

  // ✅ ONLY include English section if required
  if (Activity.EnglishRequired) {
    context += `
ENGLISH PROFICIENCY
English Proficiency Required: YES
English Proficiency Document: ${VARIANTS.YES_NO[Variants.English] || "Not submitted"}
`;
  } else {
    context += `
ENGLISH PROFICIENCY
English Proficiency Required: NO
`;
  }

  return context;
}

/* =====================================================
   LLM CALL
===================================================== */

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent.

RULE:
- If English Proficiency Required = NO
  → Do NOT mention English tests or documents anywhere.

Return STRICT JSON only.
QA_Summary and QA_Advisory_Notes must be under 190 characters.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  if (!req.body?.Current) {
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }

  try {
    const transformed = transformLeadSquaredPayload(req.body);
    const context = buildApplicantContext(transformed);
    const qaResult = await runIntakeQA(context);

    return res.status(200).json({
      status: "INTAKE_QA_COMPLETED",
      ...qaResult
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
app.listen(PORT, () => {
  console.log(`✓ Intake QA Agent running on port ${PORT}`);
});
