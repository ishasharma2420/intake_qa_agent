import express from "express";
import OpenAI from "openai";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ✅ In-memory cache for QA results (activity ID → result)
const qaResultsCache = new Map();

// Clean up old cache entries (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, value] of qaResultsCache.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      qaResultsCache.delete(key);
    }
  }
}, 60000); // Run every minute

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

const inferTranscriptVariant = (file) => {
  if (!file || file === "" || file === "Not Uploaded") return "";
  return "V2";
};

function transformLeadSquaredPayload(lsPayload) {
  const current = lsPayload.Current || {};
  const data = lsPayload.Data || {};
  
  const getValue = (...keys) => {
    for (const key of keys) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== '') {
        return String(val).trim();
      }
    }
    for (const key of keys) {
      const val = current[key];
      if (val !== undefined && val !== null && val !== '') {
        return String(val).trim();
      }
    }
    return "";
  };

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
      mx_Program_Name: getValue('mx_Program_Name', 'mx_Program_Interest', 'Program Interest', 'Program Name'),
      mx_Program_Level: getValue('mx_Program_Level', 'Program Level'),
      mx_Intended_Intake_Term: getValue('mx_Intended_Intake_Term', 'Intended Intake Term'),
      mx_Custom_26: getValue('mx_Custom_26', 'Mode of Study'),
      mx_Custom_27: getValue('mx_Custom_27', 'Campus Preference'),
      mx_Campus: getValue('mx_Campus', 'Campus'),
      mx_Custom_1: getValue('mx_Custom_1', 'Citizenship Status'),
      mx_Custom_4: getValue('mx_Custom_4', 'Years at Current Address'),
      mx_Custom_5: getValue('mx_Custom_5', 'Residency for Tuition'),
      mx_Custom_2: getValue('mx_Custom_2', 'Government ID Type', 'Govt ID Type'),
      mx_Custom_3: getValue('mx_Custom_3', 'Govt ID Digits', 'Government ID Digits'),
      mx_Custom_6: getValue('mx_Custom_6', 'High School Name'),
      mx_Custom_7: getValue('mx_Custom_7', 'School State'),
      mx_Custom_8: getValue('mx_Custom_8', 'Graduation Year'),
      mx_Custom_9: getValue('mx_Custom_9', 'GPA Scale'),
      mx_Custom_10: getValue('mx_Custom_10', 'Final GPA'),
      mx_Custom_42: getValue('mx_Custom_42', 'Add College Details'),
      mx_Custom_37: getValue('mx_Custom_37', 'College Name'),
      mx_Custom_38: getValue('mx_Custom_38', 'College State'),
      mx_Custom_39: getValue('mx_Custom_39', 'College Graduation Year'),
      mx_Custom_40: getValue('mx_Custom_40', 'College GPA Scale'),
      mx_Custom_41: getValue('mx_Custom_41', 'College Final GPA'),
      mx_Custom_43: getValue('mx_Custom_43', 'Add Degree Details'),
      mx_Custom_11: getValue('mx_Custom_11', 'Degree Name'),
      mx_Custom_12: getValue('mx_Custom_12', 'Institution'),
      mx_Custom_13: getValue('mx_Custom_13', 'Country of Institution'),
      mx_Custom_14: getValue('mx_Custom_14', 'Start Year'),
      mx_Custom_15: getValue('mx_Custom_15', 'End Year'),
      mx_Custom_17: getValue('mx_Custom_17', 'GPA Scale for Degree'),
      mx_Custom_16: getValue('mx_Custom_16', 'GPA for Degree'),
      mx_Custom_18: getValue('mx_Custom_18', 'Academic Issues'),
      mx_Custom_19: getValue('mx_Custom_19', 'FA Required'),
      mx_Custom_20: getValue('mx_Custom_20', 'FAFSA Status'),
      mx_Custom_21: getValue('mx_Custom_21', 'Scholarship Applied'),
      mx_Custom_22: getValue('mx_Custom_22', 'Funding Source'),
      mx_Custom_23: getValue('mx_Custom_23', 'Household Income Range'),
      mx_Custom_34: getValue('mx_Custom_34', 'English Proficiency Requiremen', 'English Proficiency Requirement'),
      mx_Custom_35: getValue('mx_Custom_35', 'English Test Type'),
      mx_Custom_24: getValue('mx_Custom_24', 'Declaration Accepted', 'Declaration')
    },
    Variants: {
      HighSchool: getValue('mx_High_School_Transcript_Variant') || inferTranscriptVariant(getValue('High School Transcript')),
      College: getValue('mx_College_Transcript_Variant'),
      Degree: getValue('mx_Degree_Certificate_Variant'),
      English: getValue('mx_English_Proficiency_Variant'),
      FAFSA: getValue('mx_FAFSA_Ack_Variant')
    }
  };
}

function buildApplicantContext(payload) {
  const { Lead = {}, Activity = {}, Variants = {} } = payload;

  const isEnglishExempt =
    /us citizen|permanent resident|green card/i.test(Activity.mx_Custom_1) ||
    /united states|usa|us/i.test(Lead.mx_Country);

  const englishSection = isEnglishExempt
    ? "ENGLISH PROFICIENCY\nExempt based on citizenship.\n"
    : `
ENGLISH PROFICIENCY
English Proficiency Requirement: ${Activity.mx_Custom_34 || "Not specified"}
English Test Type: ${Activity.mx_Custom_35 || "Not specified"}
English Proficiency Status: ${VARIANTS.YES_NO[Variants.English] || "Not applicable"}
`;

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

${englishSection}

DECLARATION
Declaration: ${Activity.mx_Custom_24 || "Not completed"}
Submission Timestamp: ${Activity.ActivityDateTime || "Not recorded"}
`;
}

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent. Follow these rules EXACTLY as written.

═══════════════════════════════════════════════════════════════════════════
RULE #1: ENGLISH PROFICIENCY (CRITICAL - APPLY FIRST)
═══════════════════════════════════════════════════════════════════════════

IF THE CONTEXT SAYS "Exempt based on citizenship" IN THE ENGLISH PROFICIENCY SECTION:
- Do NOT mention English proficiency ANYWHERE
- Do NOT check English test scores
- Do NOT flag missing English requirements
- Treat as if English section doesn't exist

ONLY CHECK ENGLISH PROFICIENCY IF context explicitly shows International citizenship.

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
- College information (UG students may come straight from high school)
- Degree information (UG students don't have degrees yet)
- If "Add College Details = No" → This is EXPECTED, DO NOT flag as concern

IF MISSING MANDATORY → QA_Status = REVIEW (NEVER FAIL)


**GRADUATE / MASTER / MASTERS / MBA:**
MANDATORY:
- College Name
- College Graduation Year
- College GPA + GPA Scale
- College Transcript Status (cannot be "Not submitted")

RECOMMENDED BUT NOT MANDATORY:
- High School information
- Degree Certificate (student may be in final year)

IF MISSING MANDATORY → QA_Status = REVIEW (NEVER FAIL)


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
- High School details

IF MISSING MANDATORY → QA_Status = REVIEW (NEVER FAIL)

═══════════════════════════════════════════════════════════════════════════
RULE #3: CITIZENSHIP & RESIDENCY (CONSISTENCY CHECKS)
═══════════════════════════════════════════════════════════════════════════

VALID COMBINATIONS:
✓ US Citizen + In-State = Valid
✓ US Citizen + Out-of-State = Valid
✓ Permanent Resident + In-State = Valid (if Years ≥ 1)
✓ International + Out-of-State = Valid

INVALID:
✗ International + In-State = Flag inconsistency

═══════════════════════════════════════════════════════════════════════════
RULE #4: GPA EVALUATION (NEVER MODIFY VALUES)
═══════════════════════════════════════════════════════════════════════════

- Report GPA exactly as provided
- Normalize internally only for risk assessment
- On 4.0 scale: <2.5 = Low, 2.5-3.2 = Moderate, >3.2 = Good
- On 5.0 scale: <3.0 = Low, 3.0-4.0 = Moderate, >4.0 = Good

═══════════════════════════════════════════════════════════════════════════
RULE #5: ACADEMIC ISSUES & BACKLOGS
═══════════════════════════════════════════════════════════════════════════

- "Backlog" = Risk MEDIUM (not HIGH)
- "Probation" = Risk HIGH
- Check consistency with transcript status

═══════════════════════════════════════════════════════════════════════════
RULE #6: DOCUMENT VARIANT INTERPRETATION
═══════════════════════════════════════════════════════════════════════════

High School Transcript:
- V1 = Strong → Positive
- V2 = Average → Acceptable
- V3 = Low performance → Risk HIGH, flag concern
- V4 = Incomplete → REVIEW
- "Not submitted" = Missing → REVIEW

College Transcript:
- V1 = High GPA, no backlogs → Positive
- V2 = Low GPA with backlogs → Risk HIGH
- V3 = Moderate GPA → Risk MEDIUM
- V4 = Under verification → REVIEW

═══════════════════════════════════════════════════════════════════════════
RULE #7: FINANCIAL AID
═══════════════════════════════════════════════════════════════════════════

- FA Required = "Yes" BUT FAFSA = "Not Started" → Flag concern
- FA Required = "No" → Don't check FAFSA fields

═══════════════════════════════════════════════════════════════════════════
RULE #8: MISSING DATA
═══════════════════════════════════════════════════════════════════════════

IF MANDATORY FIELD MISSING → QA_Status = REVIEW, Risk = MEDIUM
IF OPTIONAL FIELD MISSING → Do not mention

═══════════════════════════════════════════════════════════════════════════
RULE #9: QA_STATUS DECISION TREE
═══════════════════════════════════════════════════════════════════════════

**PASS:**
- All mandatory fields present
- No major inconsistencies
- Acceptable academic standing

**REVIEW:**
- Some mandatory fields missing
- Minor inconsistencies
- Academic issues present
- Documents pending
- USE AS DEFAULT WHEN UNCERTAIN

**FAIL:**
- Major contradictions (multiple severe issues)
- USE EXTREMELY SPARINGLY
- NEVER use FAIL for missing data alone
- NEVER use FAIL for Undergraduate applications unless catastrophic

═══════════════════════════════════════════════════════════════════════════
RULE #10: RISK LEVEL
═══════════════════════════════════════════════════════════════════════════

LOW: All met, strong performance
MEDIUM: 1-3 minor issues, most requirements met
HIGH: Multiple mandatory missing, poor performance, major inconsistencies

═══════════════════════════════════════════════════════════════════════════
RULE #11: OUTPUT FORMATTING
═══════════════════════════════════════════════════════════════════════════

QA_Summary: Max 190 chars, complete sentence
QA_Key_Findings: 2-4 POSITIVE observations (NEVER empty)
QA_Concerns: 2-4 issues (DO NOT include exempt items)
QA_Advisory_Notes: Max 190 chars, actionable

═══════════════════════════════════════════════════════════════════════════
FORBIDDEN ACTIONS
═══════════════════════════════════════════════════════════════════════════

✗ DO NOT flag English for exempt students
✗ DO NOT flag optional UG fields (college/degree)
✗ DO NOT use FAIL for UG applications
✗ DO NOT return empty QA_Key_Findings
✗ DO NOT flag "Add College Details = No" as concern for UG

═══════════════════════════════════════════════════════════════════════════
JSON OUTPUT SCHEMA
═══════════════════════════════════════════════════════════════════════════

{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "string",
  "QA_Key_Findings": ["positive 1", "positive 2"],
  "QA_Concerns": ["issue 1", "issue 2"],
  "QA_Advisory_Notes": "string"
}

OUTPUT ONLY VALID JSON. NO PREAMBLE.
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

  if (/undergraduate|ug/i.test(context) && result.QA_Status === "FAIL") {
    result.QA_Status = "REVIEW";
    if (result.QA_Risk_Level === "HIGH") {
      result.QA_Risk_Level = "MEDIUM";
    }
  }

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

  if (!result.QA_Key_Findings || result.QA_Key_Findings.length === 0) {
    result.QA_Key_Findings = ["Application received for review"];
  }

  return result;
}

app.post("/intake-qa-agent", async (req, res) => {
  console.log("==== INTAKE QA WEBHOOK RECEIVED ====");
  console.log("Timestamp:", new Date().toISOString());

  const lsPayload = req.body;
  const activityId = lsPayload.ProspectActivityId || "";
  const leadId = lsPayload.RelatedProspectId || "";

  console.log("Activity ID:", activityId);
  console.log("Lead ID:", leadId);

  if (!lsPayload.Current && !lsPayload.Data) {
    return res.json({ 
      status: "IGNORED_INVALID_WEBHOOK",
      reason: "Missing LeadSquared payload structure"
    });
  }

  const currentKeys = Object.keys(lsPayload.Current || {});
  const dataKeys = Object.keys(lsPayload.Data || {});
  
  // ✅ CHECK CACHE FIRST - if this is second call, return cached result
  if (activityId && qaResultsCache.has(activityId)) {
    console.log("✓ Returning cached QA result for activity:", activityId);
    const cachedResult = qaResultsCache.get(activityId).result;
    return res.json(cachedResult);
  }

  if (currentKeys.length === 0 && dataKeys.length === 0) {
    console.log("⚠️ Empty payload");
    return res.json({ 
      status: "ACKNOWLEDGED_EMPTY_PAYLOAD",
      message: "Empty payload acknowledged"
    });
  }

  const hasVariantsOnly = currentKeys.length <= 10 && dataKeys.length === 0;
  if (hasVariantsOnly) {
    console.log("⚠️ Variants-only payload - checking cache");
    
    // Check if we have a cached result
    if (activityId && qaResultsCache.has(activityId)) {
      console.log("✓ Found cached result, returning it");
      const cachedResult = qaResultsCache.get(activityId).result;
      return res.json(cachedResult);
    }
    
    console.log("⚠️ No cached result found, returning default");
    return res.json({
      status: "INTAKE_QA_COMPLETED",
      QA_Status: "REVIEW",
      QA_Risk_Level: "MEDIUM",
      QA_Summary: "Application received and queued for review.",
      QA_Key_Findings: ["Application received"],
      QA_Concerns: ["Pending full assessment"],
      QA_Advisory_Notes: "Complete assessment pending data availability."
    });
  }

  try {
    console.log("✓ Valid webhook with data detected");

    const transformedPayload = transformLeadSquaredPayload(lsPayload);
    console.log("✓ Payload transformed");

    const hasMinimumData = 
      transformedPayload.Lead.Id || 
      transformedPayload.Activity.mx_Program_Level ||
      transformedPayload.Activity.mx_Program_Name;

    if (!hasMinimumData) {
      console.log("⚠️ Insufficient data");
      return res.json({
        status: "INSUFFICIENT_DATA_POST_TRANSFORM",
        message: "Unable to extract minimum required fields"
      });
    }

    const context = buildApplicantContext(transformedPayload);
    const qaResult = await runIntakeQA(context);
    
    console.log("✓ QA completed");
    console.log("QA Result:", JSON.stringify(qaResult, null, 2));

    const response = {
      status: "INTAKE_QA_COMPLETED",
      QA_Status: qaResult.QA_Status,
      QA_Risk_Level: qaResult.QA_Risk_Level,
      QA_Summary: qaResult.QA_Summary,
      QA_Key_Findings: qaResult.QA_Key_Findings,
      QA_Concerns: qaResult.QA_Concerns,
      QA_Advisory_Notes: qaResult.QA_Advisory_Notes
    };

    // ✅ CACHE THE RESULT for subsequent calls
    if (activityId) {
      qaResultsCache.set(activityId, {
        result: response,
        timestamp: Date.now()
      });
      console.log("✓ Cached result for activity:", activityId);
    }

    return res.json(response);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    return res.status(500).json({
      status: "INTAKE_QA_FAILED",
      error: err.message,
      QA_Status: "REVIEW",
      QA_Risk_Level: "HIGH",
      QA_Summary: "System error occurred during assessment.",
      QA_Key_Findings: ["Application received"],
      QA_Concerns: ["System error - manual review required"],
      QA_Advisory_Notes: "Technical issue prevented automated assessment."
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    cacheSize: qaResultsCache.size
  });
});

app.get("/", (req, res) => {
  res.json({
    service: "Intake QA Agent API",
    status: "running",
    cacheSize: qaResultsCache.size
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════");
  console.log("✓ Intake QA Agent running on port", PORT);
  console.log("✓ In-memory cache enabled");
  console.log("═══════════════════════════════════════════════");
});
