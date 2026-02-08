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

CRITICAL: Output STRICT JSON with character limits enforced.
- QA_Summary: Max 190 characters (leave buffer for safety)
- QA_Advisory_Notes: Max 190 characters (leave buffer for safety)
- Both fields MUST be complete sentences with proper ending punctuation
- If approaching limit, use concise wording but maintain clarity

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
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context }
    ]
  });

  const result = JSON.parse(response.choices[0].message.content);

  // Enforce character limits with proper sentence ending
  ["QA_Summary", "QA_Advisory_Notes"].forEach(key => {
    if (result[key]?.length > 200) {
      // Find last complete sentence within 197 chars
      let text = result[key].slice(0, 197);
      const lastPeriod = text.lastIndexOf('.');
      const lastExclaim = text.lastIndexOf('!');
      const lastQuestion = text.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);
      
      if (lastSentenceEnd > 0) {
        result[key] = text.slice(0, lastSentenceEnd + 1);
      } else {
        result[key] = text.trim() + "...";
      }
    }
  });

  return result;
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  console.log("==== INTAKE QA WEBHOOK RECEIVED ====");
  console.log("Full payload:", JSON.stringify(req.body, null, 2));
  console.log("Payload keys:", Object.keys(req.body));
  
  const payload = req.body;

  // More flexible guard - check if this looks like LeadSquared data
  const hasLeadData = payload.Lead || payload.Activity || payload.Variants;
  
  if (!hasLeadData) {
    console.log("⚠️ Payload missing Lead/Activity/Variants structure");
    console.log("This appears to be a non-intake event or malformed request");
    return res.json({ 
      status: "IGNORED_NON_INTAKE_EVENT",
      reason: "Missing required payload structure"
    });
  }

  try {
    console.log("✓ Valid intake payload detected");
    console.log("Lead ID:", payload.Lead?.Id || "N/A");
    console.log("Activity ID:", payload.Activity?.Id || "N/A");
    
    const context = buildApplicantContext(payload);
    console.log("Context built successfully");
    
    const qaResult = await runIntakeQA(context);
    console.log("QA Result:", JSON.stringify(qaResult, null, 2));

    return res.json({
      status: "INTAKE_QA_COMPLETED",
      ...qaResult
    });
  } catch (err) {
    console.error("❌ INTAKE QA ERROR", err);
    console.error("Error stack:", err.stack);
    
    return res.status(500).json({
      status: "INTAKE_QA_FAILED",
      error: err.message,
      errorType: err.name
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✓ Intake QA Agent running on port ${PORT}`)
);
