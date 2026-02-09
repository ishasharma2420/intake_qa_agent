import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ===================== VARIANTS ===================== */

const VARIANTS = {
  HIGH_SCHOOL_TRANSCRIPT: {
    V1: "Strong academic performance.",
    V2: "Average academic performance.",
    V3: "Low academic performance with failures.",
    V4: "Incomplete transcript."
  },
  COLLEGE_TRANSCRIPT: {
    V1: "High GPA, no backlogs.",
    V2: "Low GPA with backlogs.",
    V3: "Moderate GPA with limited backlogs.",
    V4: "Transcript under verification."
  },
  DEGREE_CERTIFICATE: {
    V1: "Completed with honors.",
    V2: "Completed.",
    V3: "Completed and verified.",
    V4: "Pending verification."
  },
  YES_NO: {
    Positive: "Provided.",
    Negative: "Not provided."
  }
};

/* ===================== TRANSFORM ===================== */

function transformLeadSquaredPayload(p) {
  const c = p.Current || {};

  return {
    citizenship: c.mx_Custom_1 || "",
    applicantCountry: c.mx_Country || "",
    programLevel: c.mx_Program_Level || "",
    context: `
Applicant Country: ${c.mx_Country || "Unknown"}
Citizenship Status: ${c.mx_Custom_1 || "Unknown"}

Program Level: ${c.mx_Program_Level || "Unknown"}

High School GPA: ${c.mx_Custom_10 || "Not provided"}
High School Transcript: ${VARIANTS.HIGH_SCHOOL_TRANSCRIPT[c.mx_High_School_Transcript_Variant] || "Not submitted"}

College GPA: ${c.mx_Custom_41 || "Not provided"}
College Transcript: ${VARIANTS.COLLEGE_TRANSCRIPT[c.mx_College_Transcript_Variant] || "Not submitted"}

Degree Certificate: ${VARIANTS.DEGREE_CERTIFICATE[c.mx_Degree_Certificate_Variant] || "Not submitted"}

English Proficiency Requirement: ${c.mx_Custom_34 || "Unknown"}
English Proficiency Status: ${VARIANTS.YES_NO[c.mx_English_Proficiency_Variant] || "Not applicable"}
`
  };
}

/* ===================== LLM ===================== */

async function runQA(context) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
Return STRICT JSON with ALL fields:

{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "",
  "QA_Key_Findings": [],
  "QA_Concerns": [],
  "QA_Advisory_Notes": ""
}

Rules:
- US Citizen OR Country = United States → DO NOT flag English proficiency
- Missing required docs → REVIEW (not FAIL)
- Always include all keys
- Max 190 chars for summary + advisory
`
      },
      { role: "user", content: context }
    ]
  });

  let result = JSON.parse(response.choices[0].message.content);

  // HARD ENFORCE SHAPE
  return {
    QA_Status: result.QA_Status || "REVIEW",
    QA_Risk_Level: result.QA_Risk_Level || "MEDIUM",
    QA_Summary: (result.QA_Summary || "").slice(0, 190),
    QA_Key_Findings: result.QA_Key_Findings || [],
    QA_Concerns: result.QA_Concerns || [],
    QA_Advisory_Notes: (result.QA_Advisory_Notes || "").slice(0, 190)
  };
}

/* ===================== WEBHOOK ===================== */

app.post("/intake-qa-agent", async (req, res) => {
  const payload = req.body || {};

  // ACK follow-up pings
  if (!payload.ActivityEventName && payload.Current?.lead_ID) {
    return res.json({ status: "ACKNOWLEDGED" });
  }

  if (payload.ActivityEventName !== "Application Intake") {
    return res.json({ status: "ACKNOWLEDGED" });
  }

  try {
    const transformed = transformLeadSquaredPayload(payload);
    const qa = await runQA(transformed.context);

    return res.json({
      status: "INTAKE_QA_COMPLETED",
      ...qa
    });
  } catch (err) {
    console.error(err);
    return res.json({
      status: "INTAKE_QA_FAILED",
      error: err.message
    });
  }
});

/* ===================== SERVER ===================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✓ Intake QA Agent running on port ${PORT}`)
);
