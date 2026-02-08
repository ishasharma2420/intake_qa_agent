import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   MOCK DOCUMENT VARIANTS (LOCKED)
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
   BUILD CONTEXT FOR LLM
===================================================== */

function buildApplicantContext(payload) {
  const { Lead = {}, Activity = {}, Variants = {} } = payload;

  return `
Applicant Profile
Name: ${Lead.FirstName || ""} ${Lead.LastName || ""}
Email: ${Lead.mx_Student_Email_ID || ""}
Program: ${Activity.mx_Program_Name || ""}
Program Level: ${Activity.mx_Program_Level || ""}
Intake Term: ${Activity.mx_Intended_Intake_Term || ""}
Mode of Study: ${Activity.mx_Custom_26 || ""}
Campus Preference: ${Activity.mx_Custom_27 || ""}
Citizenship: ${Activity.mx_Custom_1 || ""}

Academic Information
High School GPA: ${Activity.mx_Custom_10 || "Not provided"} (Scale: ${Activity.mx_Custom_9 || "N/A"})
College GPA: ${Activity.mx_Custom_41 || "Not provided"} (Scale: ${Activity.mx_Custom_40 || "N/A"})
Degree GPA: ${Activity.mx_Custom_16 || "Not provided"} (Scale: ${Activity.mx_Custom_17 || "N/A"})
Academic Issues: ${Activity.mx_Custom_18 || "None"}

Financial Aid
FA Required: ${Activity.mx_Custom_19 || "No"}
FAFSA Status: ${Activity.mx_Custom_20 || "Not Started"}

Documents Summary
High School Transcript: ${VARIANTS.HIGH_SCHOOL_TRANSCRIPT[Variants.HighSchool] || "Not submitted"}
College Transcript: ${VARIANTS.COLLEGE_TRANSCRIPT[Variants.College] || "Not submitted"}
Degree Certificate: ${VARIANTS.DEGREE_CERTIFICATE[Variants.Degree] || "Not submitted"}
English Proficiency: ${VARIANTS.YES_NO[Variants.English] || "Not applicable"}
FAFSA Acknowledgement: ${VARIANTS.YES_NO[Variants.FAFSA] || "Not submitted"}
`;
}

/* =====================================================
   LLM CALL
===================================================== */

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent.

Rules:
- Base decisions ONLY on provided data.
- Do not guess or assume missing values.
- Use conservative judgment.
- Respect program level requirements.
- Backlogs increase risk but do not automatically fail.

Output STRICT JSON.
Each of QA_Summary and QA_Advisory_Notes MUST:
- Be complete sentences
- Be under 200 characters
- End naturally (no truncation mid-sentence)

Schema:
{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "",
  "QA_Key_Findings": [],
  "QA_Concerns": [],
  "QA_Advisory_Notes": ""
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context }
    ]
  });

  const result = JSON.parse(response.choices[0].message.content);

  // Safety clamp (last resort)
  ["QA_Summary", "QA_Advisory_Notes"].forEach(key => {
    if (result[key]?.length > 200) {
      result[key] = result[key].slice(0, 197) + "...";
    }
  });

  return result;
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  console.log("---- INTAKE QA WEBHOOK RECEIVED ----");
  console.log(JSON.stringify(req.body, null, 2));

  const payload = req.body;

  // 🔥 SINGLE, CORRECT GUARD FOR LEADSQUARED UDS
  if (!payload.ProspectActivityId) {
    console.log("Ignoring non-UDS or follow-up automation ping");
    return res.json({ status: "IGNORED_NON_INTAKE_EVENT" });
  }

  try {
    const context = buildApplicantContext(payload);
    const qaResult = await runIntakeQA(context);

    return res.json({
      status: "INTAKE_QA_COMPLETED",
      ...qaResult
    });
  } catch (err) {
    console.error("INTAKE QA ERROR", err);
    return res.status(500).json({
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
  console.log(`Intake QA Agent running on port ${PORT}`)
);
