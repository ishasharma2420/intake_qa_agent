import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   MOCK OCR VARIANT DEFINITIONS (PHASE 1 – LOCKED)
===================================================== */

// High School Transcript
const HIGH_SCHOOL_TRANSCRIPT = {
  V1: "Strong academic performance with consistently high grades.",
  V2: "Average academic performance with no major disciplinary issues.",
  V3: "Below average academic performance with multiple low-scoring subjects.",
  V4: "High school transcript missing or incomplete."
};

// College Transcript
const COLLEGE_TRANSCRIPT = {
  V1: "GPA: 3.6 / 4.0\nBacklogs: 0\nGap Years: 0",
  V2: "GPA: 3.0 / 4.0\nBacklogs: 1\nGap Years: 0",
  V3: "GPA: 2.2 / 4.0\nBacklogs: 5\nGap Years: 2",
  V4: "GPA: 1.9 / 4.0\nBacklogs: 7\nGap Years: 3"
};

// Degree Certificate
const DEGREE_CERTIFICATE = {
  V1: "Degree completed and verified.",
  V2: "Degree certificate present but university or year mismatch detected.",
  V3: "Provisional degree certificate submitted; final certificate pending.",
  V4: "Degree certificate missing."
};

// FAFSA Acknowledgement
const FAFSA_ACK = {
  Positive: "Financial aid application approved.",
  Negative: "No financial aid approval on record."
};

// English Proficiency
const ENGLISH_PROFICIENCY = {
  Positive: "Required English proficiency test cleared.",
  Negative: "Required English proficiency test not cleared."
};

/* =====================================================
   MOCK OCR ASSEMBLER
===================================================== */

function buildMockOCRText(lead) {
  const sections = [];

  if (lead.mx_High_School_Transcript_Variant) {
    sections.push(
      `High School Transcript:\n${HIGH_SCHOOL_TRANSCRIPT[lead.mx_High_School_Transcript_Variant]}`
    );
  }

  if (lead.mx_College_Transcript_Variant) {
    sections.push(
      `College Transcript:\n${COLLEGE_TRANSCRIPT[lead.mx_College_Transcript_Variant]}`
    );
  }

  if (lead.mx_Degree_Certificate_Variant) {
    sections.push(
      `Degree Certificate:\n${DEGREE_CERTIFICATE[lead.mx_Degree_Certificate_Variant]}`
    );
  }

  if (lead.mx_FAFSA_Ack_Variant) {
    sections.push(
      `FAFSA Acknowledgement:\n${FAFSA_ACK[lead.mx_FAFSA_Ack_Variant]}`
    );
  }

  if (lead.mx_English_Proficiency_Variant) {
    sections.push(
      `English Proficiency:\n${ENGLISH_PROFICIENCY[lead.mx_English_Proficiency_Variant]}`
    );
  }

  return sections.join("\n\n");
}

/* =====================================================
   INTAKE QA LLM (PHASE 2 – EXPANDED SCHEMA)
===================================================== */

async function runIntakeQALLM(ocrText) {
  const systemPrompt = `
You are an Intake Quality Assurance Agent for a university admissions team.

Evaluate the applicant strictly based on the provided information.

Instructions:
- Do NOT assume missing data.
- Be conservative where information is incomplete.
- Base conclusions only on evidence present.
- Maintain a professional admissions-review tone.

Return STRICT JSON ONLY in the following schema:

{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "2–3 sentence executive summary",

  "QA_Key_Findings": [
    "Bullet-style factual observations"
  ],

  "QA_Concerns": [
    "Only include if applicable"
  ],

  "QA_Advisory_Notes": "Reasoned guidance explaining what should be considered next and why"
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: ocrText }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

/* =====================================================
   WEBHOOK ENDPOINT
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  console.log("---- INTAKE QA WEBHOOK RECEIVED ----");
  console.log(JSON.stringify(req.body, null, 2));

  const leadPayload = req.body;

  // Phase 1: Mock OCR
  const mockOCRText = buildMockOCRText(leadPayload);

  console.log("---- MOCK OCR OUTPUT ----");
  console.log(mockOCRText);

  // Phase 2: Intake QA LLM
  const qaResult = await runIntakeQALLM(mockOCRText);

  console.log("---- INTAKE QA RESULT ----");
  console.log(qaResult);

  return res.json({
    status: "INTAKE_QA_COMPLETED",
    ...qaResult
  });
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
