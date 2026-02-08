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
   TRANSFORM LEADSQUARED PAYLOAD
===================================================== */

function transformLeadSquaredPayload(lsPayload) {
  const current = lsPayload.Current || {};
  
  return {
    Lead: {
      Id: current.ProspectID || current.lead_ID,
      FirstName: current.FirstName || "",
      LastName: current.LastName || "",
      mx_Student_Email_ID: current.EmailAddress || ""
    },
    Activity: {
      Id: lsPayload.ProspectActivityId,
      mx_Program_Name: current.mx_Program_Interest || current.mx_Program_Name || "",
      mx_Program_Level: current.mx_Program_Level || "",
      mx_Intended_Intake_Term: current.mx_Intended_Intake_Term || "",
      mx_Custom_26: current.mx_Custom_26 || "",
      mx_Custom_27: current.mx_Custom_27 || "",
      mx_Custom_1: current.mx_Custom_1 || "",
      mx_Custom_10: current.mx_Custom_10 || "",
      mx_Custom_9: current.mx_Custom_9 || "",
      mx_Custom_41: current.mx_Custom_41 || "",
      mx_Custom_40: current.mx_Custom_40 || "",
      mx_Custom_16: current.mx_Custom_16 || "",
      mx_Custom_17: current.mx_Custom_17 || "",
      mx_Custom_18: current.mx_Custom_18 || "",
      mx_Custom_19: current.mx_Custom_19 || "",
      mx_Custom_20: current.mx_Custom_20 || ""
    },
    Variants: {
      HighSchool: current.mx_High_School_Transcript_Variant,
      College: current.mx_College_Transcript_Variant,
      Degree: current.mx_Degree_Certificate_Variant,
      English: current.mx_English_Proficiency_Variant,
      FAFSA: current.mx_FAFSA_Ack_Variant
    }
  };
}

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
  console.log("Raw payload keys:", Object.keys(req.body));
  
  const lsPayload = req.body;

  // Check if this is a LeadSquared webhook
  if (!lsPayload.Current) {
    console.log("⚠️ Not a LeadSquared webhook - missing Current object");
    return res.json({ 
      status: "IGNORED_NON_INTAKE_EVENT",
      reason: "Missing LeadSquared Current object"
    });
  }

  try {
    console.log("✓ LeadSquared webhook detected");
    
    // Transform LeadSquared payload to expected format
    const transformedPayload = transformLeadSquaredPayload(lsPayload);
    console.log("Transformed payload:", JSON.stringify(transformedPayload, null, 2));
    
    const context = buildApplicantContext(transformedPayload);
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
