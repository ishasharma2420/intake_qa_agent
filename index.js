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

const HIGH_SCHOOL_TRANSCRIPT_MAP = {
  V1: "High School Transcript:\nExcellent academic performance with consistent grades.\n",
  V2: "High School Transcript:\nAverage academic performance with no major disciplinary issues.\n",
  V3: "High School Transcript:\nLow academic performance with multiple failed subjects.\n",
  V4: "High School Transcript:\nIncomplete transcript with missing semesters.\n"
};

const COLLEGE_TRANSCRIPT_MAP = {
  V1: "College Transcript:\nGPA: 3.8 / 4.0\nNo backlogs.\n",
  V2: "College Transcript:\nGPA: 2.2 / 4.0\nBacklogs: 5\nGap Years: 2\n",
  V3: "College Transcript:\nGPA: 2.8 / 4.0\nBacklogs: 2\n",
  V4: "College Transcript:\nTranscript submitted but under verification.\n"
};

const DEGREE_CERTIFICATE_MAP = {
  V1: "Degree Certificate:\nDegree completed with honors.\n",
  V2: "Degree Certificate:\nDegree completed.\n",
  V3: "Degree Certificate:\nDegree completed and verified.\n",
  V4: "Degree Certificate:\nDegree certificate pending verification.\n"
};

const YES_NO_MAP = {
  Positive: "Status: Requirement met.\n",
  Negative: "Status: Requirement not met.\n"
};

/* =====================================================
   MOCK OCR ASSEMBLER
===================================================== */

function buildMockOCRText(lead) {
  let ocrText = "";

  ocrText +=
    HIGH_SCHOOL_TRANSCRIPT_MAP[
      lead.mx_High_School_Transcript_Variant
    ] || "";

  ocrText +=
    COLLEGE_TRANSCRIPT_MAP[
      lead.mx_College_Transcript_Variant
    ] || "";

  ocrText +=
    DEGREE_CERTIFICATE_MAP[
      lead.mx_Degree_Certificate_Variant
    ] || "";

  if (lead.mx_FAFSA_Ack_Variant) {
    ocrText += "FAFSA Acknowledgement:\n";
    ocrText += YES_NO_MAP[lead.mx_FAFSA_Ack_Variant] || "";
  }

  if (lead.mx_English_Proficiency_Variant) {
    ocrText += "English Proficiency:\n";
    ocrText += YES_NO_MAP[lead.mx_English_Proficiency_Variant] || "";
  }

  return ocrText.trim();
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

  // ✅ Normalize LeadSquared payload
  const leadPayload = req.body.Current || null;

  // 🚫 HARD STOP: ignore non-intake / empty webhook invocations
  if (
    !leadPayload ||
    (
      !leadPayload.mx_High_School_Transcript_Variant &&
      !leadPayload.mx_College_Transcript_Variant &&
      !leadPayload.mx_Degree_Certificate_Variant &&
      !leadPayload.mx_FAFSA_Ack_Variant &&
      !leadPayload.mx_English_Proficiency_Variant
    )
  ) {
    console.log("⚠️ Skipping Intake QA: no variant data present");
    return res.status(200).json({
      status: "IGNORED_NON_INTAKE_EVENT"
    });
  }

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
