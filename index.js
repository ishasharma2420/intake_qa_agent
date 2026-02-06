import express from "express";

const app = express();
app.use(express.json());

/* =====================================================
   MOCK OCR VARIANT DEFINITIONS (LOCKED)
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
  V1: `
GPA: 3.6 / 4.0
Backlogs: 0
Gap Years: 0
`,
  V2: `
GPA: 3.0 / 4.0
Backlogs: 1
Gap Years: 0
`,
  V3: `
GPA: 2.2 / 4.0
Backlogs: 5
Gap Years: 2
`,
  V4: `
GPA: 1.9 / 4.0
Backlogs: 7
Gap Years: 3
`
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
   MOCK OCR ASSEMBLER (SCHEMA NAMES)
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
   WEBHOOK ENDPOINT
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  console.log("---- INTAKE QA WEBHOOK RECEIVED ----");
  console.log(JSON.stringify(req.body, null, 2));

  const leadPayload = req.body;

  // STEP 1: Mock OCR
  const mockOCRText = buildMockOCRText(leadPayload);

  console.log("---- MOCK OCR OUTPUT ----");
  console.log(mockOCRText);

  return res.json({
    status: "WEBHOOK_RECEIVED_SUCCESSFULLY",
    message: "Mock OCR completed. Ready for Intake QA processing.",
    mock_ocr_text: mockOCRText
  });
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
