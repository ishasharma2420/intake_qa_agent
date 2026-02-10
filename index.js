import express from "express";
import OpenAI from "openai";
import cors from "cors";

const app = express();
app.use(cors());
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
   LLM CALL WITH BULLETPROOF CONDITIONAL RULES
===================================================== */

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent. Follow these rules EXACTLY as written.

═══════════════════════════════════════════════════════════════════════════
RULE #1: ENGLISH PROFICIENCY (CRITICAL - APPLY FIRST)
═══════════════════════════════════════════════════════════════════════════

AUTOMATIC EXEMPTIONS - DO NOT CHECK OR FLAG ENGLISH PROFICIENCY IF:
✓ Citizenship Status contains "US Citizen" → EXEMPT
✓ Citizenship Status contains "Permanent Resident" → EXEMPT
✓ Citizenship Status contains "Green Card" → EXEMPT
✓ Country = "United States" OR "USA" OR "US" → EXEMPT

ONLY CHECK ENGLISH PROFICIENCY IF:
✗ Citizenship Status = "International" AND Country ≠ "United States"

IF STUDENT IS EXEMPT:
- Do NOT mention English proficiency in QA_Concerns
- Do NOT mention English proficiency in QA_Advisory_Notes
- Do NOT flag missing English test scores
- Ignore English Proficiency fields entirely

═══════════════════════════════════════════════════════════════════════════
RULE #2: PROGRAM LEVEL REQUIREMENTS (CONDITIONAL LOGIC)
═══════════════════════════════════════════════════════════════════════════

**UNDERGRADUATE (UG) / BACHELOR:**
MANDATORY:
- High School Name
- High School Graduation Year
- High School GPA + GPA Scale
- High School Transcript Status (cannot be "Not submitted")

OPTIONAL (DO NOT FLAG IF MISSING):
- College information (many UG students come straight from high school)
- Degree information (UG students don't have degrees yet)

IF MISSING MANDATORY → QA_Status = REVIEW


**GRADUATE / MASTER / MASTERS / MBA:**
MANDATORY:
- High School Name + Graduation Year (still required for context)
- College Name
- College Graduation Year
- College GPA + GPA Scale
- College Transcript Status (cannot be "Not submitted")

RECOMMENDED BUT NOT MANDATORY:
- Degree Certificate (student may be in final year)

OPTIONAL:
- High school GPA details (less relevant for graduate programs)

IF MISSING MANDATORY → QA_Status = REVIEW


**DOCTORAL / PHD / DOCTORATE:**
MANDATORY:
- College Name
- College Graduation Year
- College GPA + GPA Scale
- College Transcript Status (cannot be "Not submitted")
- Degree Name
- Degree Institution
- Degree GPA + GPA Scale
- Degree Certificate Status (cannot be "Not submitted")

OPTIONAL (DO NOT FLAG):
- High School details (too old to matter for PhD)

IF MISSING MANDATORY → QA_Status = REVIEW

═══════════════════════════════════════════════════════════════════════════
RULE #3: CITIZENSHIP & RESIDENCY (CONSISTENCY CHECKS)
═══════════════════════════════════════════════════════════════════════════

VALID COMBINATIONS:
✓ US Citizen + In-State Residency = Valid
✓ US Citizen + Out-of-State Residency = Valid
✓ Permanent Resident + In-State Residency = Valid (if Years at Address ≥ 1)
✓ Permanent Resident + Out-of-State Residency = Valid
✓ International + Out-of-State Residency = Valid

INVALID COMBINATIONS (FLAG AS INCONSISTENCY):
✗ International + In-State Residency = Inconsistent (flag in QA_Concerns)
✗ Any Citizenship + In-State Residency + Years at Address < 1 = Questionable (flag)

IF INCONSISTENCY DETECTED → Increase Risk Level by 1 step

═══════════════════════════════════════════════════════════════════════════
RULE #4: GPA EVALUATION (NEVER MODIFY VALUES)
═══════════════════════════════════════════════════════════════════════════

PRINCIPLES:
- GPA values are ALWAYS reported exactly as provided
- Scale is explicit: "4.0", "5.0", "100" (percentage), or custom
- Normalize ONLY for internal evaluation, NEVER modify the value

EVALUATION GUIDELINES (for internal risk assessment only):
- On 4.0 scale: <2.5 = Low, 2.5-3.2 = Moderate, >3.2 = Good
- On 5.0 scale: <3.0 = Low, 3.0-4.0 = Moderate, >4.0 = Good
- On 100 scale: <60% = Low, 60-75% = Moderate, >75% = Good

STRICT RULES:
✗ DO NOT say "GPA is 3.5" if student declared "2.8"
✗ DO NOT recalculate or convert GPAs
✗ DO NOT compare GPAs across different scales
✓ DO compare GPA relative to its own scale

IF GPA MISSING BUT REQUIRED → QA_Status = REVIEW, Risk = MEDIUM
IF GPA SCALE MISSING → Cannot evaluate, QA_Status = REVIEW

═══════════════════════════════════════════════════════════════════════════
RULE #5: ACADEMIC ISSUES & BACKLOGS (RISK WEIGHTING)
═══════════════════════════════════════════════════════════════════════════

DEFINITIONS:
- "Backlog" = Previously failed courses, now cleared
- "Probation" = Currently on academic probation
- "Dismissed" = Previously dismissed from institution
- "None" = No academic issues

RISK IMPACT:
- Academic Issues = "None" → No impact on risk
- Academic Issues = "Backlog" → Risk = MEDIUM (not HIGH, not auto-fail)
- Academic Issues = "Probation" → Risk = HIGH, flag for review
- Academic Issues = "Dismissed" → Risk = HIGH, flag for review

CONSISTENCY CHECK:
✗ If Academic Issues = "None" BUT College Transcript = "Low GPA with multiple backlogs"
  → FLAG as inconsistency in QA_Concerns

✗ If Academic Issues = "Backlog" BUT College Transcript = "High GPA, no backlogs"
  → FLAG as inconsistency in QA_Concerns

✓ If Academic Issues = "Backlog" AND College Transcript = "Moderate GPA, limited backlogs"
  → Consistent, Risk = MEDIUM

═══════════════════════════════════════════════════════════════════════════
RULE #6: DOCUMENT VARIANT INTERPRETATION (NOT OCR)
═══════════════════════════════════════════════════════════════════════════

These are MOCK descriptors simulating document review outcomes.

HIGH SCHOOL TRANSCRIPT:
- "Strong academic performance with consistent grades" (V1) → Positive indicator
- "Average performance with no disciplinary issues" (V2) → Acceptable
- "Low performance with multiple failed subjects" (V3) → Risk = HIGH, flag concern
- "Incomplete transcript with missing semesters" (V4) → Cannot verify, QA_Status = REVIEW
- "Not submitted" → Missing required document, QA_Status = REVIEW

COLLEGE TRANSCRIPT:
- "High GPA with no backlogs" (V1) → Positive indicator
- "Low GPA with multiple backlogs and gap years" (V2) → Risk = HIGH, flag concern
- "Moderate GPA with limited backlogs" (V3) → Risk = MEDIUM
- "Transcript submitted but under verification" (V4) → Cannot confirm, QA_Status = REVIEW
- "Not submitted" → Missing required document (if required for program level)

DEGREE CERTIFICATE:
- "Degree completed with honors" (V1) → Positive indicator
- "Degree completed" (V2) → Acceptable
- "Degree completed and verified" (V3) → Acceptable
- "Degree certificate pending verification" (V4) → Cannot confirm, QA_Status = REVIEW
- "Not submitted" → Missing (only flag if required for program level)

═══════════════════════════════════════════════════════════════════════════
RULE #7: FINANCIAL AID (CONSISTENCY & COMPLETENESS)
═══════════════════════════════════════════════════════════════════════════

CONSISTENCY CHECKS:

✗ Financial Aid Required = "Yes" BUT FAFSA Status = "Not Started"
  → FLAG: "Student requires financial aid but has not started FAFSA application"

✗ FAFSA Status = "Completed" OR "Approved" BUT FAFSA Acknowledgement = "Requirement not met"
  → FLAG: "FAFSA reported as completed but acknowledgement not submitted"

✗ Household Income Range = "<$30,000" BUT Financial Aid Required = "No"
  → FLAG: "Low household income but student not seeking financial aid"

✓ Financial Aid Required = "No" → No need to check FAFSA fields

✓ Financial Aid Required = "Yes" + FAFSA Status = "Completed" + FAFSA Ack = "Requirement met"
  → Consistent, positive indicator

IMPACT ON QA_STATUS:
- Financial aid inconsistencies → Note in QA_Concerns, DO NOT fail application
- Missing FAFSA when required → Risk = MEDIUM

═══════════════════════════════════════════════════════════════════════════
RULE #8: MISSING DATA (CONTEXT-AWARE HANDLING)
═══════════════════════════════════════════════════════════════════════════

IDENTIFY MISSING DATA:
- "Not provided"
- "Not specified"
- Empty string ""
- "N/A"

RULES FOR MISSING DATA:

IF MANDATORY FIELD MISSING (based on Program Level from Rule #2):
→ QA_Status = REVIEW
→ List specific missing field in QA_Concerns
→ Risk = MEDIUM (minimum)

IF OPTIONAL FIELD MISSING:
→ DO NOT mention in QA_Concerns
→ DO NOT penalize
→ Only note if it would significantly strengthen application

IF RECOMMENDED FIELD MISSING:
→ May mention in QA_Advisory_Notes as "Consider providing X for stronger application"
→ DO NOT affect QA_Status

═══════════════════════════════════════════════════════════════════════════
RULE #9: DECLARATION & TIMESTAMP
═══════════════════════════════════════════════════════════════════════════

Declaration Field:
✓ If Declaration = "I agree" OR "Completed" OR "Yes" → Application properly submitted
✗ If Declaration = "Not completed" OR empty → FLAG: "Application declaration not completed"

Submission Timestamp:
✓ If present → Note submission date in QA_Summary (if space permits)
✗ If missing → Minor concern, not critical

═══════════════════════════════════════════════════════════════════════════
RULE #10: QA_STATUS DECISION TREE (FINAL DETERMINATION)
═══════════════════════════════════════════════════════════════════════════

**PASS:**
✓ ALL mandatory fields present for program level
✓ NO major inconsistencies detected
✓ Acceptable academic standing (GPA relative to scale is reasonable)
✓ All required documents submitted and verified
✓ NO critical concerns

**REVIEW:**
✓ Some mandatory fields missing
✓ Minor inconsistencies detected (e.g., FA fields, residency questions)
✓ Academic issues present (backlogs, probation) but not severe
✓ Documents pending verification
✓ Moderate risk concerns that need human review

**FAIL:**
✓ Major contradictions (e.g., claims degree but no college transcript)
✓ Severe academic issues with no mitigating factors
✓ Critical inconsistencies across multiple areas
✓ Use FAIL sparingly - prefer REVIEW when uncertain

═══════════════════════════════════════════════════════════════════════════
RULE #11: RISK LEVEL ASSIGNMENT
═══════════════════════════════════════════════════════════════════════════

**LOW:**
- All requirements met
- Strong academic performance
- No inconsistencies
- Complete documentation

**MEDIUM:**
- Some missing optional/recommended fields
- Minor inconsistencies
- Academic issues resolved (backlogs cleared)
- Some documents pending verification
- Most requirements met

**HIGH:**
- Multiple mandatory fields missing
- Major inconsistencies detected
- Poor academic performance (low GPA relative to scale)
- Current academic probation or dismissal
- Multiple documents missing or unverified
- Financial aid inconsistencies combined with other issues

═══════════════════════════════════════════════════════════════════════════
RULE #12: OUTPUT FORMATTING (STRICT REQUIREMENTS)
═══════════════════════════════════════════════════════════════════════════

QA_Summary:
- Max 190 characters
- Complete sentence with natural ending (period, exclamation, or question mark)
- High-level overview of application status
- Example: "Application shows strong academic background but missing college transcript verification."

QA_Key_Findings (POSITIVE OBSERVATIONS ONLY):
- Array of 2-4 items
- Focus on strengths: good GPA, complete documentation, strong transcripts, etc.
- Examples:
  * "Strong high school GPA of 3.8 on 4.0 scale"
  * "All required documents submitted and verified"
  * "US Citizen - no English proficiency requirement"
  * "Financial aid documentation complete"

QA_Concerns (ISSUES & FLAGS ONLY):
- Array of 2-4 items
- List actual problems detected
- Be specific about what's missing or inconsistent
- Examples:
  * "College transcript shows multiple backlogs"
  * "Missing degree certificate for doctoral program"
  * "International student claiming in-state residency"
  * "FAFSA required but not started"
- DO NOT include items that don't apply (e.g., English proficiency for US Citizens)

QA_Advisory_Notes:
- Max 190 characters
- Complete sentence
- Actionable next steps for admissions team
- Example: "Verify college transcript backlogs and request current academic standing letter."

═══════════════════════════════════════════════════════════════════════════
FORBIDDEN ACTIONS (NEVER DO THESE)
═══════════════════════════════════════════════════════════════════════════

✗ DO NOT flag English proficiency for US Citizens, Permanent Residents, or Green Card Holders
✗ DO NOT invent or guess missing field values
✗ DO NOT modify or recalculate GPA values
✗ DO NOT assume documents are verified if status says "pending" or "not submitted"
✗ DO NOT compare GPAs across different scales
✗ DO NOT flag optional fields as concerns for wrong program level
✗ DO NOT add concerns that don't exist in the data
✗ DO NOT penalize students for not providing optional information
✗ DO NOT make assumptions about missing data

═══════════════════════════════════════════════════════════════════════════
JSON OUTPUT SCHEMA (STRICT)
═══════════════════════════════════════════════════════════════════════════

{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "string (max 190 chars, complete sentence)",
  "QA_Key_Findings": ["positive observation 1", "positive observation 2", ...],
  "QA_Concerns": ["issue 1", "issue 2", ...],
  "QA_Advisory_Notes": "string (max 190 chars, complete sentence)"
}

OUTPUT ONLY VALID JSON. NO PREAMBLE. NO EXPLANATION. JUST THE JSON OBJECT.
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
      status: "IGNORED_NON_LEADSQUARED_WEBHOOK",
      reason: "Missing LeadSquared Current object"
    });
  }

  try {
    console.log("✓ LeadSquared webhook detected");

    const transformedPayload = transformLeadSquaredPayload(lsPayload);
    console.log("Transformed payload:", JSON.stringify(transformedPayload, null, 2));

    const context = buildApplicantContext(transformedPayload);
    console.log("Context built successfully");

    const qaResult = await runIntakeQA(context);
    console.log("QA Result:", JSON.stringify(qaResult, null, 2));

    return res.json({
      status: "INTAKE_QA_COMPLETED",
      QA_Status: qaResult.QA_Status,
      QA_Risk_Level: qaResult.QA_Risk_Level,
      QA_Summary: qaResult.QA_Summary,
      QA_Key_Findings: JSON.stringify(qaResult.QA_Key_Findings),
      QA_Concerns: JSON.stringify(qaResult.QA_Concerns),
      QA_Advisory_Notes: qaResult.QA_Advisory_Notes
    });
  } catch (err) {
    console.error("❌ INTAKE QA ERROR", err);
    console.error("Error stack:", err.stack);

    return res.status(500).json({
      status: "INTAKE_QA_FAILED",
      error: err.message,
      errorType: err.name,
      QA_Status: "REVIEW",
      QA_Risk_Level: "HIGH",
      QA_Summary: "System error occurred during QA assessment",
      QA_Key_Findings: JSON.stringify([]),
      QA_Concerns: JSON.stringify(["System error during assessment"]),
      QA_Advisory_Notes: "Manual review required due to system error"
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
