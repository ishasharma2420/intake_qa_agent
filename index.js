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
      mx_Student_Email_ID:
        current.mx_Student_Email_ID || current.EmailAddress || "",
      Phone: current.Phone || "",
      mx_Date_of_Birth: current.mx_Date_of_Birth || "",
      mx_Country: current.mx_Country || ""
    },
    Activity: {
      ActivityDateTime: lsPayload.CreatedOn || "",

      mx_Program_Name: current.mx_Program_Name || "",
      mx_Program_Level: current.mx_Program_Level || "",
      mx_Intended_Intake_Term: current.mx_Intended_Intake_Term || "",
      mx_Custom_26: current.mx_Custom_26 || "",
      mx_Custom_27: current.mx_Custom_27 || "",
      mx_Campus: current.mx_Campus || "",

      mx_Custom_1: current.mx_Custom_1 || "",
      mx_Custom_4: current.mx_Custom_4 || "",
      mx_Custom_5: current.mx_Custom_5 || "",

      mx_Custom_6: current.mx_Custom_6 || "",
      mx_Custom_7: current.mx_Custom_7 || "",
      mx_Custom_8: current.mx_Custom_8 || "",
      mx_Custom_9: current.mx_Custom_9 || "",
      mx_Custom_10: current.mx_Custom_10 || "",

      mx_Custom_42: current.mx_Custom_42 || "",
      mx_Custom_37: current.mx_Custom_37 || "",
      mx_Custom_38: current.mx_Custom_38 || "",
      mx_Custom_39: current.mx_Custom_39 || "",
      mx_Custom_40: current.mx_Custom_40 || "",
      mx_Custom_41: current.mx_Custom_41 || "",

      mx_Custom_43: current.mx_Custom_43 || "",
      mx_Custom_11: current.mx_Custom_11 || "",
      mx_Custom_12: current.mx_Custom_12 || "",
      mx_Custom_13: current.mx_Custom_13 || "",
      mx_Custom_14: current.mx_Custom_14 || "",
      mx_Custom_15: current.mx_Custom_15 || "",
      mx_Custom_17: current.mx_Custom_17 || "",
      mx_Custom_16: current.mx_Custom_16 || "",
      mx_Custom_18: current.mx_Custom_18 || "",

      mx_Custom_19: current.mx_Custom_19 || "",
      mx_Custom_20: current.mx_Custom_20 || "",
      mx_Custom_21: current.mx_Custom_21 || "",
      mx_Custom_22: current.mx_Custom_22 || "",
      mx_Custom_23: current.mx_Custom_23 || "",

      mx_Custom_34: current.mx_Custom_34 || "",
      mx_Custom_35: current.mx_Custom_35 || "",
      mx_Custom_24: current.mx_Custom_24 || ""
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
  const { Lead, Activity, Variants } = payload;

  return `
APPLICANT PROFILE
Name: ${Lead.FirstName} ${Lead.LastName}
Email: ${Lead.mx_Student_Email_ID}
Country: ${Lead.mx_Country}

Program Level: ${Activity.mx_Program_Level}
Citizenship Status: ${Activity.mx_Custom_1}

High School GPA: ${Activity.mx_Custom_10}
High School Transcript: ${
    VARIANTS.HIGH_SCHOOL_TRANSCRIPT[Variants.HighSchool] || "Not submitted"
  }

College GPA: ${Activity.mx_Custom_41}
College Transcript: ${
    VARIANTS.COLLEGE_TRANSCRIPT[Variants.College] || "Not submitted"
  }

Degree Certificate: ${
    VARIANTS.DEGREE_CERTIFICATE[Variants.Degree] || "Not submitted"
  }

English Proficiency Status: ${
    VARIANTS.YES_NO[Variants.English] || "Not applicable"
  }
`;
}

/* =====================================================
   NORMALIZE LLM RESPONSE (CRITICAL FIX)
===================================================== */

function normalizeQAResult(result) {
  return {
    QA_Status: result.QA_Status || "REVIEW",
    QA_Risk_Level: result.QA_Risk_Level || "LOW",
    QA_Summary: result.QA_Summary || "",
    QA_Advisory_Notes: result.QA_Advisory_Notes || "",
    QA_Key_Findings: Array.isArray(result.QA_Key_Findings)
      ? result.QA_Key_Findings
      : [],
    QA_Concerns: Array.isArray(result.QA_Concerns)
      ? result.QA_Concerns
      : []
  };
}

/* =====================================================
   LLM CALL
===================================================== */

async function runIntakeQA(context) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Return STRICT JSON using the schema. Always respect citizenship-based English exemptions."
      },
      { role: "user", content: context }
    ]
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return normalizeQAResult(parsed);
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post("/intake-qa-agent", async (req, res) => {
  const payload = req.body || {};

  const isApplicationIntake =
    payload.ActivityEventName === "Application Intake" ||
    payload.ActivityEvent === "212";

  if (!isApplicationIntake || !payload.Current) {
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }

  try {
    const transformed = transformLeadSquaredPayload(payload);
    const context = buildApplicantContext(transformed);
    const qaResult = await runIntakeQA(context);

    return res.status(200).json({
      status: "INTAKE_QA_COMPLETED",
      ...qaResult
    });
  } catch (err) {
    return res.status(200).json({
      status: "INTAKE_QA_FAILED",
      error: err.message
    });
  }
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✓ Intake QA Agent running on port ${PORT}`)
);
