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
   TRANSFORM LEADSQUARED PAYLOAD - ROBUST VERSION
===================================================== */

function transformLeadSquaredPayload(lsPayload) {
  // LeadSquared sends data in multiple formats:
  // 1. Activity webhooks: Data in lsPayload.Data
  // 2. Automation webhooks: Data in lsPayload.Current
  // 3. UDS webhooks: Minimal data in lsPayload.Current
  
  const current = lsPayload.Current || {};
  const data = lsPayload.Data || {};
  
  // Helper function to get value from multiple possible locations
  const getValue = (...keys) => {
    // First check Data object (activity data)
    for (const key of keys) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== '') {
        return String(val).trim();
      }
    }
    // Then check Current object (automation/lead data)
    for (const key of keys) {
      const val = current[key];
      if (val !== undefined && val !== null && val !== '') {
        return String(val).trim();
      }
    }
    return "";
  };

  console.log("📦 Data object keys:", Object.keys(data).length > 0 ? Object.keys(data).slice(0, 10) : "Empty");
  console.log("📦 Current object keys:", Object.keys(current).length > 0 ? Object.keys(current).slice(0, 10) : "Empty");

  return {
    Lead: {
      Id: getValue('ProspectID', 'lead_ID', 'mx_ProspectID') || lsPayload.RelatedProspectId || "",
      FirstName: getValue('FirstName', 'First Name', 'mx_FirstName'),
      LastName: getValue('LastName', 'Last Name', 'mx_LastName'),
      mx_Student_Email_ID: getValue('mx_Student_Email_ID', 'Student Email ID', 'EmailAddress', 'Email', 'mx_EmailAddress'),
      Phone: getValue('Phone', 'Phone Number', 'mx_Phone'),
      mx_Date_of_Birth: getValue('mx_Date_of_Birth', 'Date of Birth', 'DateOfBirth'),
      mx_Country: getValue('mx_Country', 'Country')
    },
    Activity: {
      Id: lsPayload.ProspectActivityId || "",
      ActivityDateTime: getValue('ActivityDateTime', 'CreatedOn') || lsPayload.CreatedOn || "",

      // Program Information
      mx_Program_Name: getValue('mx_Program_Name', 'mx_Program_Interest', 'Program Interest', 'Program Name'),
      mx_Program_Level: getValue('mx_Program_Level', 'Program Level'),
      mx_Intended_Intake_Term: getValue('mx_Intended_Intake_Term', 'Intended Intake Term'),
      mx_Custom_26: getValue('mx_Custom_26', 'Mode of Study'),
      mx_Custom_27: getValue('mx_Custom_27', 'Campus Preference'),
      mx_Campus: getValue('mx_Campus', 'Campus'),

      // Citizenship & Residency
      mx_Custom_1: getValue('mx_Custom_1', 'Citizenship Status'),
      mx_Custom_4: getValue('mx_Custom_4', 'Years at Current Address'),
      mx_Custom_5: getValue('mx_Custom_5', 'Residency for Tuition'),

      // Government ID
      mx_Custom_2: getValue('mx_Custom_2', 'Government ID Type', 'Govt ID Type'),
      mx_Custom_3: getValue('mx_Custom_3', 'Govt ID Digits', 'Government ID Digits'),

      // High School
      mx_Custom_6: getValue('mx_Custom_6', 'High School Name'),
      mx_Custom_7: getValue('mx_Custom_7', 'School State'),
      mx_Custom_8: getValue('mx_Custom_8', 'Graduation Year'),
      mx_Custom_9: getValue('mx_Custom_9', 'GPA Scale'),
      mx_Custom_10: getValue('mx_Custom_10', 'Final GPA'),

      // College
      mx_Custom_42: getValue('mx_Custom_42', 'Add College Details'),
      mx_Custom_37: getValue('mx_Custom_37', 'College Name'),
      mx_Custom_38: getValue('mx_Custom_38', 'College State'),
      mx_Custom_39: getValue('mx_Custom_39', 'College Graduation Year'),
      mx_Custom_40: getValue('mx_Custom_40', 'College GPA Scale'),
      mx_Custom_41: getValue('mx_Custom_41', 'College Final GPA'),

      // Degree
      mx_Custom_43: getValue('mx_Custom_43', 'Add Degree Details'),
      mx_Custom_11: getValue('mx_Custom_11', 'Degree Name'),
      mx_Custom_12: getValue('mx_Custom_12', 'Institution'),
      mx_Custom_13: getValue('mx_Custom_13', 'Country of Institution'),
      mx_Custom_14: getValue('mx_Custom_14', 'Start Year'),
      mx_Custom_15: getValue('mx_Custom_15', 'End Year'),
      mx_Custom_17: getValue('mx_Custom_17', 'GPA Scale for Degree'),
      mx_Custom_16: getValue('mx_Custom_16', 'GPA for Degree'),
      mx_Custom_18: getValue('mx_Custom_18', 'Academic Issues'),

      // Financial Aid
      mx_Custom_19: getValue('mx_Custom_19', 'FA Required'),
      mx_Custom_20: getValue('mx_Custom_20', 'FAFSA Status'),
      mx_Custom_21: getValue('mx_Custom_21', 'Scholarship Applied'),
      mx_Custom_22: getValue('mx_Custom_22', 'Funding Source'),
      mx_Custom_23: getValue('mx_Custom_23', 'Household Income Range'),

      // English Proficiency
      mx_Custom_34: getValue('mx_Custom_34', 'English Proficiency Requiremen', 'English Proficiency Requirement'),
      mx_Custom_35: getValue('mx_Custom_35', 'English Test Type'),

      // Declaration
      mx_Custom_24: getValue('mx_Custom_24', 'Declaration Accepted', 'Declaration')
    },
    Variants: {
      HighSchool: getValue('mx_High_School_Transcript_Variant', 'High School Transcript') || current.mx_High_School_Transcript_Variant,
      College: getValue('mx_College_Transcript_Variant', 'College Transcripts') || current.mx_College_Transcript_Variant,
      Degree: getValue('mx_Degree_Certificate_Variant', 'Degree Certificate') || current.mx_Degree_Certificate_Variant,
      English: getValue('mx_English_Proficiency_Variant', 'English Proficiency') || current.mx_English_Proficiency_Variant,
      FAFSA: getValue('mx_FAFSA_Ack_Variant', 'FAFSA Acknowledgement') || current.mx_FAFSA_Ack_Variant
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

IF MISSING MANDATORY → QA_Status = REVIEW (not FAIL)


**GRADUATE / MASTER / MASTERS / MBA:**
MANDATORY:
- College Name
- College Graduation Year
- College GPA + GPA Scale
- College Transcript Status (cannot be "Not submitted")

RECOMMENDED BUT NOT MANDATORY:
- High School information (still valuable context)
- Degree Certificate (student may be in final year)

IF MISSING MANDATORY → QA_Status = REVIEW (not FAIL)


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

IF MISSING MANDATORY → QA_Status = REVIEW (not FAIL)

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

✓ Financial Aid Required = "No" → No need to check FAFSA fields, DO NOT flag

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
→ QA_Status = REVIEW (NEVER FAIL for missing data alone)
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
✓ If Declaration = "Yes" OR "Accepted" OR "I agree" OR "Completed" → Application properly submitted
✗ If Declaration = "Not completed" OR "No" OR empty → FLAG: "Application declaration not completed"

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
✓ At most 1-2 minor issues

**REVIEW:**
✓ Some mandatory fields missing
✓ Minor inconsistencies detected (e.g., FA fields, residency questions)
✓ Academic issues present (backlogs) but not severe
✓ Documents pending verification
✓ Moderate risk concerns that need human review
✓ Use REVIEW as default when uncertain

**FAIL:**
✓ Major contradictions (e.g., claims degree but no college transcript AND transcript says "not submitted")
✓ Severe academic issues with no mitigating factors (e.g., dismissed from multiple institutions)
✓ Critical inconsistencies across multiple areas (3+ major red flags)
✓ Use FAIL VERY sparingly - only for egregious issues
✓ NEVER use FAIL for missing data alone

DEFAULT TO REVIEW WHEN IN DOUBT.

═══════════════════════════════════════════════════════════════════════════
RULE #11: RISK LEVEL ASSIGNMENT
═══════════════════════════════════════════════════════════════════════════

**LOW:**
- All requirements met
- Strong academic performance
- No inconsistencies
- Complete documentation
- No concerns

**MEDIUM:**
- 1-3 missing optional/recommended fields
- Minor inconsistencies (1-2 issues)
- Academic issues resolved (backlogs cleared)
- Some documents pending verification
- Most requirements met

**HIGH:**
- Multiple mandatory fields missing (3+)
- Major inconsistencies detected (2+)
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
- Example: "Undergraduate applicant with complete high school records and average transcript."

QA_Key_Findings (POSITIVE OBSERVATIONS ONLY):
- Array of 2-4 items
- Focus on strengths: good GPA, complete documentation, strong transcripts, etc.
- ALWAYS include at least 1-2 positive findings if ANY data exists
- Examples:
  * "High school transcript submitted showing average performance"
  * "US Citizen - no English proficiency requirement"
  * "Financial aid documentation in progress"
  * "Degree certificate verified and complete"
- If truly no positive findings, use: ["Application received for review"]

QA_Concerns (ISSUES & FLAGS ONLY):
- Array of 2-4 items
- List actual problems detected
- Be specific about what's missing or inconsistent
- Examples:
  * "Missing high school graduation year and GPA for undergraduate program"
  * "College transcript shows low GPA with multiple backlogs"
  * "FAFSA required but not started"
- DO NOT include items that don't apply (e.g., English proficiency for US Citizens)
- DO NOT flag optional fields

QA_Advisory_Notes:
- Max 190 characters
- Complete sentence
- Actionable next steps for admissions team
- Example: "Request missing high school details and verify transcript authenticity."

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
✗ DO NOT use FAIL status for missing data alone
✗ DO NOT return empty QA_Key_Findings array - always find at least one positive

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

  // Ensure QA_Key_Findings is never empty
  if (!result.QA_Key_Findings || result.QA_Key_Findings.length === 0) {
    result.QA_Key_Findings = ["Application received for review"];
  }

  return result;
}

/* =====================================================
   WEBHOOK ENDPOINT WITH COMPREHENSIVE VALIDATION
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  console.log("==== INTAKE QA WEBHOOK RECEIVED ====");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Raw payload keys:", Object.keys(req.body));

  const lsPayload = req.body;

  // VALIDATION #1: Check if this is a LeadSquared webhook
  if (!lsPayload.Current && !lsPayload.Data) {
    console.log("⚠️ Not a LeadSquared webhook - missing both Current and Data objects");
    return res.json({ 
      status: "IGNORED_INVALID_WEBHOOK",
      reason: "Missing LeadSquared payload structure"
    });
  }

  // VALIDATION #2: Check for empty UDS configuration calls
  const currentKeys = Object.keys(lsPayload.Current || {});
  const dataKeys = Object.keys(lsPayload.Data || {});
  
  if (currentKeys.length === 0 && dataKeys.length === 0) {
    console.log("⚠️ Empty payload detected - likely UDS configuration test");
    return res.json({ 
      status: "ACKNOWLEDGED_EMPTY_PAYLOAD",
      message: "Empty payload acknowledged, no QA needed"
    });
  }

  // VALIDATION #3: Check if we have minimum data for QA assessment
  const hasVariantsOnly = currentKeys.length <= 10 && dataKeys.length === 0;
  if (hasVariantsOnly) {
    console.log("⚠️ Variants-only payload detected - insufficient data for QA");
    return res.json({
      status: "INSUFFICIENT_DATA",
      message: "Payload contains only variant data, no lead/activity fields"
    });
  }

  try {
    console.log("✓ Valid LeadSquared webhook detected");

    // Transform payload
    const transformedPayload = transformLeadSquaredPayload(lsPayload);
    console.log("✓ Payload transformed successfully");
    console.log("Lead ID:", transformedPayload.Lead.Id);
    console.log("Program Level:", transformedPayload.Activity.mx_Program_Level);

    // VALIDATION #4: Check for minimum required data after transformation
    const hasMinimumData = 
      transformedPayload.Lead.Id || 
      transformedPayload.Activity.mx_Program_Level ||
      transformedPayload.Activity.mx_Program_Name;

    if (!hasMinimumData) {
      console.log("⚠️ Transformed payload lacks minimum required fields");
      return res.json({
        status: "INSUFFICIENT_DATA_POST_TRANSFORM",
        message: "Unable to extract minimum required fields from payload"
      });
    }

    // Build context for LLM
    const context = buildApplicantContext(transformedPayload);
    console.log("✓ Context built successfully");

    // Run QA assessment
    const qaResult = await runIntakeQA(context);
    console.log("✓ QA assessment completed");
    console.log("QA Result:", JSON.stringify(qaResult, null, 2));

    // Return formatted response
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
    console.error("❌ INTAKE QA ERROR");
    console.error("Error type:", err.name);
    console.error("Error message:", err.message);
    console.error("Stack trace:", err.stack);

    // Return error response with valid QA structure
    return res.status(500).json({
      status: "INTAKE_QA_FAILED",
      error: err.message,
      errorType: err.name,
      QA_Status: "REVIEW",
      QA_Risk_Level: "HIGH",
      QA_Summary: "System error occurred during QA assessment.",
      QA_Key_Findings: JSON.stringify(["Application received"]),
      QA_Concerns: JSON.stringify(["System error during assessment - manual review required"]),
      QA_Advisory_Notes: "Technical issue prevented automated assessment. Conduct manual review."
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    service: "Intake QA Agent",
    version: "1.0.0"
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Intake QA Agent API",
    status: "running",
    endpoints: {
      health: "/health",
      qaAgent: "/intake-qa-agent (POST)"
    },
    timestamp: new Date().toISOString()
  });
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════");
  console.log("✓ Intake QA Agent running on port", PORT);
  console.log("✓ Health check available at /health");
  console.log("✓ QA endpoint available at /intake-qa-agent");
  console.log("═══════════════════════════════════════════════");
});
