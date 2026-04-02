import express from "express";
import OpenAI from "openai";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const OPENAI_TIMEOUT_MS = 60_000;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: OPENAI_TIMEOUT_MS
});

// ✅ In-memory cache for QA results
const qaResultsCache = new Map();

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = 60_000;
const MAX_SUMMARY_LENGTH = 190;
const MAX_SUMMARY_TRUNCATE = 200;

// Clean up old cache entries (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - CACHE_TTL_MS;
  for (const [key, value] of qaResultsCache.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      qaResultsCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS);

// ──────────────────────────────────────────────────────────────────────
// VARIANT DEFINITIONS — Career School Context
// Career schools require a high school diploma or GED for admission.
// College transcripts and degree certificates are NOT part of the
// standard career school intake process.
// ──────────────────────────────────────────────────────────────────────
const VARIANTS = {
  HIGH_SCHOOL_DIPLOMA: {
    V1: "High school diploma verified with strong academic record.",
    V2: "High school diploma verified with satisfactory record.",
    V3: "GED or equivalency certificate submitted.",
    V4: "Diploma or equivalency document pending verification."
  },
  YES_NO: {
    Positive: "Requirement met.",
    Negative: "Requirement not met."
  }
};

// ──────────────────────────────────────────────────────────────────────
// FIX 1: Dummy file uploads are IGNORED.
// A file reference string from LeadSquared doesn't mean the doc is valid.
// Only an explicit variant field (V1-V4) set by form logic or automation
// counts as a real document submission. Raw file presence is ignored.
// ──────────────────────────────────────────────────────────────────────
const inferDiplomaVariant = (file) => {
  if (!file || file === "" || file === "Not Uploaded") return "";
  return "";
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
      mx_Enrollment_Status: getValue('mx_Enrollment_Status', 'Enrollment Status'),
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
      HighSchoolDiploma: getValue('mx_High_School_Transcript_Variant') || inferDiplomaVariant(getValue('High School Transcript')),
      English: getValue('mx_English_Proficiency_Variant'),
      FAFSA: getValue('mx_FAFSA_Ack_Variant')
    }
  };
}

function buildApplicantContext(payload) {
  const { Lead = {}, Activity = {}, Variants = {} } = payload;

  // FIX 2: English exemption regex — exact match so "Russia", "Belarus",
  // "Cyprus" etc. don't falsely match the /us/ pattern.
  const isEnglishExempt =
    /us citizen|permanent resident|green card/i.test(Activity.mx_Custom_1) ||
    /^(united states|usa|us)$/i.test((Lead.mx_Country || "").trim());

  const englishSection = isEnglishExempt
    ? "ENGLISH PROFICIENCY\nExempt based on citizenship.\n"
    : `
ENGLISH PROFICIENCY
English Proficiency Requirement: ${Activity.mx_Custom_34 || "Not specified"}
English Test Type: ${Activity.mx_Custom_35 || "Not specified"}
English Proficiency Status: ${VARIANTS.YES_NO[Variants.English] || "Not applicable"}
`;

  // FIX 3: Explicit DOCUMENT STATUS section in the context.
  // Tells the LLM exactly what documents are validated based on variants ONLY.
  // Raw file attachments are irrelevant — variant field IS the source of truth.
  const docStatusSection = `
DOCUMENT STATUS (based on validated variants — raw file attachments are ignored)
High School Diploma/GED: ${Variants.HighSchoolDiploma ? `Variant ${Variants.HighSchoolDiploma} — ${VARIANTS.HIGH_SCHOOL_DIPLOMA[Variants.HighSchoolDiploma] || "Unknown variant"}` : "NOT VALIDATED (no variant set, treat as not submitted)"}
English Proficiency: ${Variants.English ? VARIANTS.YES_NO[Variants.English] || "Unknown" : "NOT VALIDATED (no variant set)"}
FAFSA Acknowledgement: ${Variants.FAFSA ? VARIANTS.YES_NO[Variants.FAFSA] || "Unknown" : "NOT VALIDATED (no variant set)"}
`;

  return `
APPLICANT PROFILE
Name: ${Lead.FirstName || ""} ${Lead.LastName || ""}
Email: ${Lead.mx_Student_Email_ID || ""}
Phone: ${Lead.Phone || ""}
Date of Birth: ${Lead.mx_Date_of_Birth || "Not provided"}
Country: ${Lead.mx_Country || "Not provided"}

PROGRAM INFORMATION
Program of Interest: ${Activity.mx_Program_Name || "Not specified"}
Enrollment Status: ${Activity.mx_Enrollment_Status || "Not specified"}
Intended Start Term: ${Activity.mx_Intended_Intake_Term || "Not specified"}
Mode of Study: ${Activity.mx_Custom_26 || "Not specified"}
Campus Preference: ${Activity.mx_Custom_27 || "Not specified"}
Campus: ${Activity.mx_Campus || "Not specified"}

CITIZENSHIP & RESIDENCY
Citizenship Status: ${Activity.mx_Custom_1 || "Not specified"}
Years at Current Address: ${Activity.mx_Custom_4 || "Not provided"}
Residency for Tuition: ${Activity.mx_Custom_5 || "Not specified"}

HIGH SCHOOL DIPLOMA / GED
High School Name: ${Activity.mx_Custom_6 || "Not provided"}
School State: ${Activity.mx_Custom_7 || "Not provided"}
Graduation Year: ${Activity.mx_Custom_8 || "Not provided"}
GPA Scale: ${Activity.mx_Custom_9 || "Not provided"}
Final GPA (Declared): ${Activity.mx_Custom_10 || "Not provided"}
Diploma/GED Status: ${VARIANTS.HIGH_SCHOOL_DIPLOMA[Variants.HighSchoolDiploma] || "Not submitted"}

ACADEMIC HISTORY
Academic Issues: ${Activity.mx_Custom_18 || "None"}

FINANCIAL AID
Financial Aid Required: ${Activity.mx_Custom_19 || "Not specified"}
FAFSA Status: ${Activity.mx_Custom_20 || "Not Started"}
Scholarship Applied: ${Activity.mx_Custom_21 || "Not specified"}
Funding Source: ${Activity.mx_Custom_22 || "Not specified"}
Household Income Range: ${Activity.mx_Custom_23 || "Not provided"}
FAFSA Acknowledgement: ${VARIANTS.YES_NO[Variants.FAFSA] || "Not submitted"}

${englishSection}

${docStatusSection}

DECLARATION
Declaration: ${Activity.mx_Custom_24 || "Not completed"}
Submission Timestamp: ${Activity.ActivityDateTime || "Not recorded"}
`;
}

async function runIntakeQA(context) {
  const systemPrompt = `
You are an Enrollment Intake QA Agent for a career school. You review applicant
records for completeness, accuracy, and enrollment readiness. These are
vocational and technical training programs (Medical Assisting, HVAC, Cosmetology,
Automotive, Welding, Dental Hygiene, Nursing, Trade Programs, Computer and
Network Technology). Applicants are enrolling in certificate or diploma programs,
NOT traditional university degree programs.

Follow these rules EXACTLY as written.

═══════════════════════════════════════════════════════════════════════════
CRITICAL: DOCUMENT VALIDATION APPROACH
═══════════════════════════════════════════════════════════════════════════

This system validates documents using STRUCTURED METADATA (variant fields),
NOT by reading or parsing uploaded files. Even if a file was uploaded, it
is only considered "submitted" if a variant (V1/V2/V3/V4) has been set.

If a document's variant is missing or says "NOT VALIDATED":
- Treat it as NOT SUBMITTED regardless of any file upload reference
- Flag it as: "Document not validated — variant not set"

If a document's variant IS set (V1-V4):
- Use the variant meaning to assess document quality
- The variant IS the validation result

═══════════════════════════════════════════════════════════════════════════
RULE #1: CAREER SCHOOL ADMISSION REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════

Career school applicants must meet these requirements:
✓ High School Diploma or GED (must be verified via variant)
✓ High School Name or equivalent (must be present)
✓ Graduation Year (must be present)
✓ Declaration accepted

These are OPTIONAL and should NOT be flagged if missing:
- GPA / GPA Scale (some career schools do not require this)
- English proficiency (if exempt based on citizenship)

IF ALL REQUIRED FIELDS ARE MET:
- DO NOT say "mandatory fields missing"
- QA_Summary should confirm application completeness

═══════════════════════════════════════════════════════════════════════════
RULE #2: ENROLLMENT STATUS CROSS-VALIDATION
═══════════════════════════════════════════════════════════════════════════

IF Enrollment Status is present, cross-check it against the record:
- "Enrollment Complete" but required documents missing → Flag mismatch
- "Documents Pending" with all documents validated → Note ready to advance
- "Scheduled to Start" but missing financial aid → Flag risk
- "Application Submitted" → Standard intake review applies

═══════════════════════════════════════════════════════════════════════════
RULE #3: ENGLISH PROFICIENCY EXEMPTIONS
═══════════════════════════════════════════════════════════════════════════

IF THE CONTEXT SAYS "Exempt based on citizenship":
- DO NOT mention English proficiency ANYWHERE
- DO NOT check English test scores
- DO NOT flag missing English requirements

═══════════════════════════════════════════════════════════════════════════
RULE #4: DOCUMENT VARIANT INTERPRETATION
═══════════════════════════════════════════════════════════════════════════

High School Diploma/GED Status Meanings:
- V1 = "Diploma verified with strong academic record" → POSITIVE
- V2 = "Diploma verified with satisfactory record" → ACCEPTABLE
- V3 = "GED or equivalency submitted" → ACCEPTABLE (flag for verification)
- V4 = "Diploma or equivalency pending verification" → Flag as "Pending verification"
- "Not submitted" or "NOT VALIDATED" = Missing document → Flag as missing

═══════════════════════════════════════════════════════════════════════════
RULE #5: FINANCIAL AID
═══════════════════════════════════════════════════════════════════════════

IF Financial Aid Required = "Yes" AND FAFSA Status = "Not Started":
- Flag as: "FAFSA application required but not yet started"

IF Financial Aid Required = "No":
- DO NOT check FAFSA fields
- DO NOT mention FAFSA in concerns

═══════════════════════════════════════════════════════════════════════════
RULE #6: QA_STATUS DECISION
═══════════════════════════════════════════════════════════════════════════

PASS:
- All required fields present
- Diploma/GED verified
- No major concerns
- Enrollment Status consistent with record

REVIEW (Use when):
- Minor inconsistencies exist
- Documents pending verification
- Financial aid incomplete
- Enrollment Status mismatch detected

FAIL:
- Only for serious contradictions or disqualifying issues
- Example: Applicant under 17 with no GED/diploma
- Example: Declaration not accepted AND critical documents missing

═══════════════════════════════════════════════════════════════════════════
RULE #7: OUTPUT CLARITY
═══════════════════════════════════════════════════════════════════════════

TERMINOLOGY — USE THESE TERMS ONLY:
- "Applicant" (never "student", "undergraduate", "graduate")
- "Application" (never "admission", "enrollment application")
- "Program" (never "degree", "degree program", "major")
- "Program completion" (never "graduation" unless referring to high school)
- "Enrollment" (never "admission")
- "Campus" (never "university", "college")

QA_Summary:
- Max 190 characters
- Be ACCURATE about what's actually missing
- Example: "Application for Medical Assisting at Los Angeles Campus meets all requirements."
- Example: "Applicant missing diploma verification. FAFSA not started."
- DO NOT say "mandatory fields missing" if they're not actually missing

QA_Key_Findings:
- 2-4 POSITIVE observations about the application
- Examples:
  * "High school diploma verified with satisfactory record"
  * "US Citizen — no English proficiency requirement"
  * "Financial aid documentation complete"
  * "All required enrollment documents submitted"

QA_Concerns:
- ONLY list ACTUAL problems found in the record
- Be SPECIFIC about what's wrong
- Examples:
  * "Diploma/GED document not yet validated — variant not set"
  * "FAFSA application required but not yet started"
  * "Enrollment Status marked as Enrollment Complete but diploma not verified"
- DO NOT list items that are optional or not applicable

QA_Advisory_Notes:
- Max 190 characters
- Give SPECIFIC next steps for the admissions team
- Examples:
  * "Applicant should submit high school diploma or GED for verification."
  * "Initiate FAFSA application to complete financial aid requirements."
  * "Verify diploma status before advancing to Scheduled to Start."

═══════════════════════════════════════════════════════════════════════════
FORBIDDEN ACTIONS
═══════════════════════════════════════════════════════════════════════════

✗ DO NOT use terms: "undergraduate", "graduate", "postgraduate", "UG", "PG",
  "Masters", "Doctoral", "degree program", "graduation" (except high school),
  "college transcript", "degree certificate"
✗ DO NOT flag English proficiency for US Citizens/Permanent Residents
✗ DO NOT say "mandatory fields missing" when they're not
✗ DO NOT use vague advisory notes
✗ DO NOT return empty QA_Key_Findings array
✗ DO NOT treat a raw file upload as document validation — only variants count
✗ DO NOT reference college or degree information — career school applicants
  are enrolling in certificate/diploma programs

═══════════════════════════════════════════════════════════════════════════
JSON OUTPUT SCHEMA
═══════════════════════════════════════════════════════════════════════════

{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "string (max 190 chars, accurate)",
  "QA_Key_Findings": ["positive 1", "positive 2"],
  "QA_Concerns": ["specific issue 1", "specific issue 2"],
  "QA_Advisory_Notes": "string (max 190 chars, specific action)"
}

OUTPUT ONLY VALID JSON. NO PREAMBLE.
`;

  // FIX 4: response_format guarantees valid JSON from OpenAI.
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context }
    ]
  });

  const rawContent = response.choices[0]?.message?.content?.trim() || "";
  let result = parseQAJson(rawContent);
  if (!result) {
    return getFallbackQAResult("REVIEW", "MEDIUM", "Unable to parse QA result.");
  }

  ["QA_Summary", "QA_Advisory_Notes"].forEach(key => {
    if (result[key]?.length > MAX_SUMMARY_TRUNCATE) {
      let text = String(result[key]).slice(0, MAX_SUMMARY_TRUNCATE - 3);
      const lastPeriod = text.lastIndexOf(".");
      const lastExclaim = text.lastIndexOf("!");
      const lastQuestion = text.lastIndexOf("?");
      const lastSentenceEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);

      if (lastSentenceEnd > 0) {
        result[key] = text.slice(0, lastSentenceEnd + 1);
      } else {
        result[key] = text.trim() + "...";
      }
    }
  });

  return normalizeQAResult(result);
}

function parseQAJson(raw) {
  if (!raw) return null;
  let str = raw.trim();
  const codeBlock = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) str = codeBlock[1].trim();
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function getFallbackQAResult(status, riskLevel, summary) {
  return {
    QA_Status: status,
    QA_Risk_Level: riskLevel,
    QA_Summary: summary,
    QA_Key_Findings: ["Application received for review"],
    QA_Concerns: ["Assessment incomplete — manual review recommended."],
    QA_Advisory_Notes: "Please complete manual review of this application."
  };
}

function normalizeQAResult(result) {
  const validStatus = ["PASS", "REVIEW", "FAIL"].includes(result.QA_Status)
    ? result.QA_Status
    : "REVIEW";
  const validRisk = ["LOW", "MEDIUM", "HIGH"].includes(result.QA_Risk_Level)
    ? result.QA_Risk_Level
    : "MEDIUM";
  const keyFindings = Array.isArray(result.QA_Key_Findings)
    ? result.QA_Key_Findings.filter(Boolean).map(String)
    : [];
  const concerns = Array.isArray(result.QA_Concerns)
    ? result.QA_Concerns.filter(Boolean).map(String)
    : [];

  return {
    QA_Status: validStatus,
    QA_Risk_Level: validRisk,
    QA_Summary: String(result.QA_Summary ?? "").slice(0, MAX_SUMMARY_LENGTH) || "Application under review.",
    QA_Key_Findings: keyFindings.length > 0 ? keyFindings : ["Application received for review"],
    QA_Concerns: concerns,
    QA_Advisory_Notes: String(result.QA_Advisory_Notes ?? "").slice(0, MAX_SUMMARY_LENGTH) || "No additional notes."
  };
}

app.post("/intake-qa-agent", async (req, res) => {
  console.log("==== INTAKE QA WEBHOOK RECEIVED ====");
  console.log("Timestamp:", new Date().toISOString());

  const lsPayload = req.body;
  const activityId = lsPayload.ProspectActivityId || "";
  const leadId = lsPayload.RelatedProspectId || 
                 lsPayload.Current?.ProspectID || 
                 lsPayload.Current?.lead_ID || "";
  
  const cacheKey = activityId || leadId;

  console.log("Activity ID:", activityId);
  console.log("Lead ID:", leadId);
  console.log("Cache Key:", cacheKey);

  if (!lsPayload.Current && !lsPayload.Data) {
    return res.json({ 
      status: "IGNORED_INVALID_WEBHOOK",
      reason: "Missing LeadSquared payload structure"
    });
  }

  const currentKeys = Object.keys(lsPayload.Current || {});
  const dataKeys = Object.keys(lsPayload.Data || {});
  
  if (cacheKey && qaResultsCache.has(cacheKey)) {
    console.log("✓ Returning cached QA result for key:", cacheKey);
    const cachedResult = qaResultsCache.get(cacheKey).result;
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
    console.log("⚠️ Variants-only payload, no cache hit for key:", cacheKey);
    
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
    console.log("✓ Variants resolved:", JSON.stringify(transformedPayload.Variants));

    const hasMinimumData = 
      transformedPayload.Lead.Id || 
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

    if (cacheKey) {
      qaResultsCache.set(cacheKey, {
        result: response,
        timestamp: Date.now()
      });
      console.log("✓ Cached result with key:", cacheKey);
      
      if (activityId && leadId && activityId !== leadId) {
        qaResultsCache.set(leadId, {
          result: response,
          timestamp: Date.now()
        });
        console.log("✓ Also cached with lead ID:", leadId);
      }
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
      QA_Concerns: ["System error — manual review required"],
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
    service: "Enrollment Intake QA Agent — Career School",
    status: "running",
    cacheSize: qaResultsCache.size
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════");
  console.log("✓ Enrollment Intake QA Agent running on port", PORT);
  console.log("✓ In-memory cache enabled");
  console.log("═══════════════════════════════════════════════");
});
