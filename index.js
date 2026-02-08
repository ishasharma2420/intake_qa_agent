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
      mx_Student_Email_ID: current.mx_Student_Email_ID || current.EmailAddress || "",
      Phone: current.Phone || "",
      mx_Date_of_Birth: current.mx_Date_of_Birth || "",
      mx_Country: current.mx_Country || ""
    },
    Activity: {
      Id: lsPayload.ProspectActivityId,
      ActivityDateTime: current.ActivityDateTime || lsPayload.CreatedOn || "",
      
      // Program Information
      mx_Program_Name: current.mx_Program_Name || "",
      mx_Program_Level: current.mx_Program_Level || "",
      mx_Intended_Intake_Term: current.mx_Intended_Intake_Term || "",
      mx_Custom_26: current.mx_Custom_26 || "", // Mode of Study
      mx_Custom_27: current.mx_Custom_27 || "", // Campus Preference
      mx_Campus: current.mx_Campus || "",
      
      // Citizenship & Residency
      mx_Custom_1: current.mx_Custom_1 || "", // Citizenship Status
      mx_Custom_4: current.mx_Custom_4 || "", // Years at Current Address
      mx_Custom_5: current.mx_Custom_5 || "", // Residency for Tuition
      
      // Government ID
      mx_Custom_2: current.mx_Custom_2 || "", // Govt ID Type
      mx_Custom_3: current.mx_Custom_3 || "", // Govt ID Last 4
      
      // High School
      mx_Custom_6: current.mx_Custom_6 || "", // High School Name
      mx_Custom_7: current.mx_Custom_7 || "", // School State
      mx_Custom_8: current.mx_Custom_8 || "", // Graduation Year
      mx_Custom_9: current.mx_Custom_9 || "", // GPA Scale
      mx_Custom_10: current.mx_Custom_10 || "", // Final GPA
      
      // College
      mx_Custom_42: current.mx_Custom_42 || "", // Add college info?
      mx_Custom_37: current.mx_Custom_37 || "", // College Name
      mx_Custom_38: current.mx_Custom_38 || "", // College State
      mx_Custom_39: current.mx_Custom_39 || "", // Graduation Year
      mx_Custom_40: current.mx_Custom_40 || "", // GPA Scale
      mx_Custom_41: current.mx_Custom_41 || "", // Final GPA
      
      // Degree
      mx_Custom_43: current.mx_Custom_43 || "", // Add degree info?
      mx_Custom_11: current.mx_Custom_11 || "", // Degree Name
      mx_Custom_12: current.mx_Custom_12 || "", // Institution
      mx_Custom_13: current.mx_Custom_13 || "", // Country of Institution
      mx_Custom_14: current.mx_Custom_14 || "", // Start Year
      mx_Custom_15: current.mx_Custom_15 || "", // End Year
      mx_Custom_17: current.mx_Custom_17 || "", // GPA Scale
      mx_Custom_16: current.mx_Custom_16 || "", // Final GPA
      mx_Custom_18: current.mx_Custom_18 || "", // Academic Issues
      
      // Financial Aid
      mx_Custom_19: current.mx_Custom_19 || "", // FA Required
      mx_Custom_20: current.mx_Custom_20 || "", // FAFSA Status
      mx_Custom_21: current.mx_Custom_21 || "", // Scholarship Applied
      mx_Custom_22: current.mx_Custom_22 || "", // Funding Source
      mx_Custom_23: current.mx_Custom_23 || "", // Household Income Range
      
      // English Proficiency
      mx_Custom_34: current.mx_Custom_34 || "", // English Proficiency Requirement
      mx_Custom_35: current.mx_Custom_35 || "", // English Test Type
      
      // Declaration
      mx_Custom_24: current.mx_Custom_24 || "" // Declaration
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
APPLICANT PROFILE
Name: ${Lead.FirstName || ""} ${Lead.LastName || ""}
Email: ${Lead.mx_Student_Email_ID || ""}
Phone: ${Lead.Phone || ""}
Date of Birth: ${Lead.mx_Date_of_Birth || "Not provided"}
Country: ${Lead.mx_Country || "Not provided"}

PROGRAM INFORMATION
Program: ${Activity.mx_Program_Name || "Not specified"}
Program Level: ${Activity.mx_Program_Level || "Not specified"}
Intended Intake Term: ${Activity.mx_Intended_Intake_Term || "Not specified"}
Mode of Study: ${Activity.mx_Custom_26 || "Not specified"}
Campus Preference: ${Activity.mx_Custom_27 || "Not specified"}
Campus: ${Activity.mx_Campus || "Not specified"}

CITIZENSHIP & RESIDENCY
Citizenship Status: ${Activity.mx_Custom_1 || "Not specified"}
Years at Current Address: ${Activity.mx_Custom_4 || "Not provided"}
Residency for Tuition: ${Activity.mx_Custom_5 || "Not specified"}

HIGH SCHOOL ACADEMIC RECORD
High School Name: ${Activity.mx_Custom_6 || "Not provided"}
School State: ${Activity.mx_Custom_7 || "Not provided"}
Graduation Year: ${Activity.mx_Custom_8 || "Not provided"}
GPA Scale: ${Activity.mx_Custom_9 || "Not provided"}
Final GPA (Declared): ${Activity.mx_Custom_10 || "Not provided"}
High School Transcript Status: ${VARIANTS.HIGH_SCHOOL_TRANSCRIPT[Variants.HighSchool] || "Not submitted"}

COLLEGE ACADEMIC RECORD (if applicable)
Add College Information: ${Activity.mx_Custom_42 || "Not specified"}
College Name: ${Activity.mx_Custom_37 || "Not provided"}
College State: ${Activity.mx_Custom_38 || "Not provided"}
Graduation Year: ${Activity.mx_Custom_39 || "Not provided"}
GPA Scale: ${Activity.mx_Custom_40 || "Not provided"}
Final GPA: ${Activity.mx_Custom_41 || "Not provided"}
College Transcript Status: ${VARIANTS.COLLEGE_TRANSCRIPT[Variants.College] || "Not submitted"}

DEGREE INFORMATION (if applicable)
Add Degree Information: ${Activity.mx_Custom_43 || "Not specified"}
Degree Name: ${Activity.mx_Custom_11 || "Not provided"}
Institution: ${Activity.mx_Custom_12 || "Not provided"}
Country of Institution: ${Activity.mx_Custom_13 || "Not provided"}
Start Year: ${Activity.mx_Custom_14 || "Not provided"}
End Year: ${Activity.mx_Custom_15 || "Not provided"}
GPA Scale: ${Activity.mx_Custom_17 || "Not provided"}
Final GPA (Declared): ${Activity.mx_Custom_16 || "Not provided"}
Academic Issues: ${Activity.mx_Custom_18 || "None"}
Degree Certificate Status: ${VARIANTS.DEGREE_CERTIFICATE[Variants.Degree] || "Not submitted"}

FINANCIAL AID
Financial Aid Required: ${Activity.mx_Custom_19 || "Not specified"}
FAFSA Status: ${Activity.mx_Custom_20 || "Not Started"}
Scholarship Applied: ${Activity.mx_Custom_21 || "Not specified"}
Funding Source: ${Activity.mx_Custom_22 || "Not specified"}
Household Income Range: ${Activity.mx_Custom_23 || "Not provided"}
FAFSA Acknowledgement: ${VARIANTS.YES_NO[Variants.FAFSA] || "Not submitted"}

ENGLISH PROFICIENCY
English Proficiency Requirement: ${Activity.mx_Custom_34 || "Not specified"}
English Test Type: ${Activity.mx_Custom_35 || "Not specified"}
English Proficiency Status: ${VARIANTS.YES_NO[Variants.English] || "Not applicable"}

DECLARATION
Declaration: ${Activity.mx_Custom_24 || "Not completed"}
Submission Timestamp: ${Activity.ActivityDateTime || "Not recorded"}
`;
}

/* =====================================================
   LLM CALL WITH SMART CONDITIONAL RULES
===================================================== */

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent.

CRITICAL CONDITIONAL RULES - APPLY THESE FIRST:

1. ENGLISH PROFICIENCY EXEMPTIONS:
   - If Citizenship Status = "US Citizen" → English proficiency NOT required, ignore English test fields
   - If Citizenship Status = "Permanent Resident" → English proficiency NOT required, ignore English test fields
   - If Citizenship Status = "International" → English proficiency IS required
   - If Country = "United States" or "USA" → English proficiency NOT required
   - Only flag missing English proficiency if student is International

2. PROGRAM LEVEL MANDATORY REQUIREMENTS:
   
   UNDERGRADUATE (UG):
   - High School transcript: MANDATORY
   - High School GPA + Scale: MANDATORY
   - College/Degree information: OPTIONAL (may be transfer student)
   - If High School data missing → QA_Status = REVIEW (not FAIL)
   
   GRADUATE/MASTERS:
   - High School transcript: MANDATORY
   - College transcript: MANDATORY
   - College GPA + Scale: MANDATORY
   - Degree information: RECOMMENDED but not mandatory (may be in final year)
   - If High School or College data missing → QA_Status = REVIEW
   
   DOCTORAL (PhD):
   - College transcript: MANDATORY
   - Degree certificate: MANDATORY
   - Degree GPA + Scale: MANDATORY
   - High School: OPTIONAL (too old to matter)
   - If College or Degree data missing → QA_Status = REVIEW

3. CITIZENSHIP & RESIDENCY LOGIC:
   - If Citizenship Status = "International" → verify Campus Preference is available for international students
   - If Residency for Tuition = "In State" but Citizenship = "International" → FLAG as inconsistency
   - If Years at Current Address < 1 and Residency = "In State" → FLAG as potential issue

4. GPA EVALUATION (NEVER MODIFY VALUES):
   - GPA is ALWAYS numeric as provided
   - Scale is explicit: "4.0", "5.0", or "%"
   - Normalize internally for reasoning ONLY
   - Examples:
     * 2.2 on 4.0 scale = Low (below 2.5)
     * 3.0 on 4.0 scale = Moderate
     * 75% on 100 scale = Moderate
     * 4.5 on 5.0 scale = High
   - NEVER report "GPA is 3.0" if student declared "2.2"
   - Compare GPA relative to scale, not absolute numbers

5. ACADEMIC ISSUES & BACKLOGS:
   - "Backlog" = prior academic difficulty, now resolved unless contradicted
   - Effect: Raises risk level, does NOT auto-fail
   - If Academic Issues = "Backlog" + College Transcript = "Multiple backlogs" → Risk = HIGH
   - If Academic Issues = "Probation" → Risk = HIGH, flag for review
   - If Academic Issues = "None" but transcript says "multiple backlogs" → FLAG inconsistency

6. DOCUMENT VARIANT INTERPRETATION (NOT OCR):
   These are MOCK descriptors, not actual OCR:
   
   High School Transcript:
   - V1 "Strong academic performance" → Positive indicator
   - V2 "Average performance" → Acceptable
   - V3 "Low performance with failed subjects" → Risk = HIGH
   - V4 "Incomplete transcript" → Cannot verify, REVIEW required
   
   College Transcript:
   - V1 "High GPA, no backlogs" → Positive indicator
   - V2 "Low GPA with backlogs" → Risk = HIGH
   - V3 "Moderate GPA, limited backlogs" → Risk = MEDIUM
   - V4 "Under verification" → Cannot confirm, REVIEW required
   
   Degree Certificate:
   - V1 "Completed with honors" → Positive indicator
   - V2/V3 "Completed" → Acceptable
   - V4 "Pending verification" → Cannot confirm, REVIEW required

7. FINANCIAL AID LOGIC:
   - If Financial Aid Required = "Yes" but FAFSA Status = "Not Started" → Flag as concern
   - If FAFSA Status = "Approved" but FAFSA Acknowledgement = "Not submitted" → FLAG inconsistency
   - If Household Income Range = "<$30,000" and Financial Aid = "No" → FLAG for review

8. MISSING REQUIRED DATA HANDLING:
   - If required sections missing for Program Level → QA_Status = REVIEW (NOT FAIL)
   - Missing optional data → Note in QA_Concerns but don't penalize
   - "Not provided", "Not specified", blank fields → Treat as MISSING, don't assume values

STRICT INFERENCE RULES:

ALLOWED:
- Compare GPA vs scale and normalize for evaluation
- Detect inconsistencies between declared values and document variants
- Apply conditional logic based on citizenship, program level, residency
- Weigh backlogs conservatively (increase risk, don't auto-fail)
- Flag missing mandatory fields for the specific program level

NOT ALLOWED:
- DO NOT guess missing field values
- DO NOT assume document uploads succeeded if status is "pending/incomplete/not submitted"
- DO NOT invent test scores, GPAs, or grades
- DO NOT modify or recalculate declared GPA values
- DO NOT flag English proficiency for US Citizens or Permanent Residents

QA_STATUS DECISION TREE:
- PASS: All mandatory fields present, no major inconsistencies, acceptable academic standing
- REVIEW: Missing some mandatory data, minor inconsistencies, backlogs present, or pending verifications
- FAIL: Major inconsistencies detected, critical contradictions, severe academic issues (use sparingly)

OUTPUT REQUIREMENTS:
- Output STRICT JSON only
- QA_Summary: Max 190 characters, complete sentence, natural ending
- QA_Advisory_Notes: Max 190 characters, complete sentence, natural ending
- QA_Key_Findings: Positive observations (2-4 items max)
- QA_Concerns: Issues flagged (2-4 items max)
- Be concise, clear, and actionable

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

  // Check if this is a LeadSquared webhook
 app.post("/intake-qa-agent", async (req, res) => {
  console.log("==== INTAKE QA WEBHOOK RECEIVED ====");
  console.log(JSON.stringify(req.body, null, 2));

  const lsPayload = req.body || {};

  const isApplicationIntake =
    lsPayload.ActivityEventName === "Application Intake" ||
    lsPayload.ActivityEvent === "212";

  // ACK follow-up automation pings
  if (!isApplicationIntake) {
    console.log("Follow-up automation ping acknowledged");
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }

  try {
    const transformedPayload = transformLeadSquaredPayload(lsPayload);
    const context = buildApplicantContext(transformedPayload);
    const qaResult = await runIntakeQA(context);

    return res.status(200).json({
      status: "INTAKE_QA_COMPLETED",
      ...qaResult
    });
  } catch (err) {
    console.error("❌ INTAKE QA ERROR", err);
    return res.status(200).json({
      status: "INTAKE_QA_FAILED",
      error: err.message
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
