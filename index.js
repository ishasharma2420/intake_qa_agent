import express from "express";
import OpenAI from "openai";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// LeadSquared API credentials
const LS_API_HOST = process.env.LS_API_HOST || "api-in21.leadsquared.com";
const LS_ACCESS_KEY = process.env.LS_ACCESS_KEY;
const LS_SECRET_KEY = process.env.LS_SECRET_KEY;

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
   FETCH ACTIVITY DATA FROM LEADSQUARED
===================================================== */

async function fetchActivityData(activityId) {
  try {
    const url = `https://${LS_API_HOST}/v2/ProspectActivity.svc/Retrieve?accessKey=${LS_ACCESS_KEY}&secretKey=${LS_SECRET_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Parameter: {
          ActivityId: activityId
        }
      })
    });

    const result = await response.json();
    
    if (result.Status === "Success" && result.ProspectActivity) {
      return result.ProspectActivity;
    }
    
    console.error("Failed to fetch activity data:", result);
    return null;
  } catch (err) {
    console.error("Error fetching activity data:", err);
    return null;
  }
}

/* =====================================================
   TRANSFORM LEADSQUARED PAYLOAD
===================================================== */

function transformLeadSquaredPayload(lsPayload, activityData) {
  const current = lsPayload.Current || {};
  
  // Helper function to get activity field value
  const getActivityField = (fieldName) => {
    if (!activityData || !activityData.Fields) return "";
    const field = activityData.Fields.find(f => f.SchemaName === fieldName);
    return field ? field.Value : "";
  };
  
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
      ActivityDateTime: lsPayload.CreatedOn || "",
      
      // Program Information
      mx_Program_Name: current.mx_Program_Interest || current.mx_Program_Name || "",
      mx_Program_Level: current.mx_Program_Level || getActivityField("mx_Program_Level"),
      mx_Intended_Intake_Term: current.mx_Intended_Intake_Term || getActivityField("mx_Intended_Intake_Term"),
      mx_Custom_26: getActivityField("mx_Custom_26"), // Mode of Study
      mx_Custom_27: getActivityField("mx_Custom_27"), // Campus Preference
      mx_Campus: getActivityField("mx_Campus"),
      
      // Citizenship & Residency
      mx_Custom_1: getActivityField("mx_Custom_1"), // Citizenship Status
      mx_Custom_4: getActivityField("mx_Custom_4"), // Years at Current Address
      mx_Custom_5: getActivityField("mx_Custom_5"), // Residency for Tuition
      
      // Government ID
      mx_Custom_2: getActivityField("mx_Custom_2"), // Govt ID Type
      mx_Custom_3: getActivityField("mx_Custom_3"), // Govt ID Last 4
      
      // High School
      mx_Custom_6: getActivityField("mx_Custom_6"), // High School Name
      mx_Custom_7: getActivityField("mx_Custom_7"), // School State
      mx_Custom_8: getActivityField("mx_Custom_8"), // Graduation Year
      mx_Custom_9: getActivityField("mx_Custom_9"), // GPA Scale
      mx_Custom_10: getActivityField("mx_Custom_10"), // Final GPA
      
      // College
      mx_Custom_42: getActivityField("mx_Custom_42"), // Add college info?
      mx_Custom_37: getActivityField("mx_Custom_37"), // College Name
      mx_Custom_38: getActivityField("mx_Custom_38"), // College State
      mx_Custom_39: getActivityField("mx_Custom_39"), // Graduation Year
      mx_Custom_40: getActivityField("mx_Custom_40"), // GPA Scale
      mx_Custom_41: getActivityField("mx_Custom_41"), // Final GPA
      
      // Degree
      mx_Custom_43: getActivityField("mx_Custom_43"), // Add degree info?
      mx_Custom_11: getActivityField("mx_Custom_11"), // Degree Name
      mx_Custom_12: getActivityField("mx_Custom_12"), // Institution
      mx_Custom_13: getActivityField("mx_Custom_13"), // Country of Institution
      mx_Custom_14: getActivityField("mx_Custom_14"), // Start Year
      mx_Custom_15: getActivityField("mx_Custom_15"), // End Year
      mx_Custom_17: getActivityField("mx_Custom_17"), // GPA Scale
      mx_Custom_16: getActivityField("mx_Custom_16"), // Final GPA
      mx_Custom_18: getActivityField("mx_Custom_18"), // Academic Issues
      
      // Financial Aid
      mx_Custom_19: getActivityField("mx_Custom_19"), // FA Required
      mx_Custom_20: getActivityField("mx_Custom_20"), // FAFSA Status
      mx_Custom_21: getActivityField("mx_Custom_21"), // Scholarship Applied
      mx_Custom_22: getActivityField("mx_Custom_22"), // Funding Source
      mx_Custom_23: getActivityField("mx_Custom_23"), // Household Income Range
      
      // English Proficiency
      mx_Custom_34: getActivityField("mx_Custom_34"), // English Proficiency Requirement
      mx_Custom_35: getActivityField("mx_Custom_35"), // English Test Type
      
      // Declaration
      mx_Custom_24: getActivityField("mx_Custom_24") // Declaration
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

COLLEGE ACADEMIC RECORD
Add College Information: ${Activity.mx_Custom_42 || "Not specified"}
College Name: ${Activity.mx_Custom_37 || "Not provided"}
College State: ${Activity.mx_Custom_38 || "Not provided"}
Graduation Year: ${Activity.mx_Custom_39 || "Not provided"}
GPA Scale: ${Activity.mx_Custom_40 || "Not provided"}
Final GPA: ${Activity.mx_Custom_41 || "Not provided"}
College Transcript Status: ${VARIANTS.COLLEGE_TRANSCRIPT[Variants.College] || "Not submitted"}

DEGREE INFORMATION
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
   LLM CALL
===================================================== */

async function runIntakeQA(context) {
  const systemPrompt = `
You are a University Admissions Intake QA Agent.

STRICT INFERENCE RULES:

ALLOWED TO INFER:
- Compare GPA vs GPA scale (e.g., 2.5 on 4.0 scale is low, 75% on 100 scale is different)
- Detect inconsistencies (e.g., low GPA + "No academic issues" is suspicious)
- Weigh backlogs conservatively (backlogs increase risk but don't automatically fail)
- Respect Program Level requirements (UG vs Graduate/Masters vs PhD have different standards)
- Flag missing critical fields for the program level

NOT ALLOWED TO INFER:
- DO NOT guess or assume missing field values
- DO NOT assume document upload was successful if status says "pending" or "not submitted"
- DO NOT invent test scores or grades
- DO NOT make assumptions about fields marked "Not provided" or "Not specified"

PROGRAM LEVEL EXPECTATIONS:
- Undergraduate (UG): High school transcript required, college optional, degree not typically needed
- Graduate/Masters: Degree certificate required, strong GPA expected, backlogs are red flags
- Doctoral (PhD): Degree certificate required, research/academic excellence expected, minimal tolerance for academic issues

DOCUMENT VARIANT INTERPRETATION:
- "Strong/High performance" = positive indicator
- "Average/Moderate performance" = acceptable but note if combined with other concerns
- "Low performance/multiple backlogs" = significant risk, flag prominently
- "Pending verification/Incomplete" = cannot confirm adequacy, flag as blocking concern
- "Requirement met" for English/FAFSA = positive
- "Requirement not met" for English/FAFSA = blocking issue if required

OUTPUT REQUIREMENTS:
- Output STRICT JSON only
- QA_Summary: Max 180 characters, complete sentence with punctuation
- QA_Advisory_Notes: Max 180 characters, complete sentence with punctuation
- Be concise but clear - prioritize most critical findings

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
      let text = result[key].slice(0, 177);
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
  
  const lsPayload = req.body;

  // Check if this is "Application Intake" activity
  if (lsPayload.ActivityEventName !== "Application Intake") {
    console.log("⚠️ Not an Application Intake event:", lsPayload.ActivityEventName || "Unknown");
    return res.json({ 
      status: "ACKNOWLEDGED",
      message: "Non-intake event acknowledged"
    });
  }

  // Check if we have an activity ID
  if (!lsPayload.ProspectActivityId) {
    console.log("⚠️ Missing ProspectActivityId");
    return res.json({ 
      status: "ACKNOWLEDGED",
      message: "Missing activity ID"
    });
  }

  try {
    console.log("✓ Processing Application Intake event");
    console.log("Activity ID:", lsPayload.ProspectActivityId);
    console.log("Lead ID:", lsPayload.RelatedProspectId);
    
    // Fetch full activity data from LeadSquared API
    console.log("Fetching activity data from LeadSquared...");
    const activityData = await fetchActivityData(lsPayload.ProspectActivityId);
    
    if (!activityData) {
      console.error("❌ Failed to fetch activity data");
      return res.status(500).json({
        status: "INTAKE_QA_FAILED",
        error: "Could not retrieve activity data from LeadSquared"
      });
    }
    
    console.log("✓ Activity data retrieved successfully");
    
    // Transform payload with fetched activity data
    const transformedPayload = transformLeadSquaredPayload(lsPayload, activityData);
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
```

## ENVIRONMENT VARIABLES YOU NEED TO ADD TO RENDER:
```
OPENAI_API_KEY=your_openai_key
LS_API_HOST=api-in21.leadsquared.com
LS_ACCESS_KEY=your_leadsquared_access_key
LS_SECRET_KEY=your_leadsquared_secret_key
