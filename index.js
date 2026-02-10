import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "2mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ===============================
   HELPERS
================================ */

const isRealApplicationIntake = (payload) => {
  return Boolean(
    payload?.ProspectActivityId &&
    (payload?.ActivityEventName === "Application Intake" ||
     payload?.ActivityEvent === "212")
  );
};

/* ===============================
   MAIN WEBHOOK
================================ */

app.post("/intake-qa-agent", async (req, res) => {
  const payload = req.body || {};

  console.log("==== WEBHOOK RECEIVED ====");
  console.log("Keys:", Object.keys(payload));

  /* --------------------------------
     HARD EXIT FOR FOLLOW-UP PINGS
  --------------------------------- */
  if (!isRealApplicationIntake(payload)) {
    console.log("↩️ Follow-up / sync ping detected. ACK only.");
    return res.status(200).json({
      status: "ACKNOWLEDGED"
    });
  }

  /* --------------------------------
     REAL APPLICATION INTAKE
  --------------------------------- */
  console.log("✅ Application Intake detected");
  console.log("ActivityId:", payload.ProspectActivityId);

  try {
    const current = payload.Current || {};

    const context = `
Applicant Country: ${current.mx_Country || "Not provided"}
Citizenship Status: ${current.mx_Custom_1 || "Not provided"}

High School Transcript Variant: ${current.mx_High_School_Transcript_Variant || "None"}
College Transcript Variant: ${current.mx_College_Transcript_Variant || "None"}
Degree Certificate Variant: ${current.mx_Degree_Certificate_Variant || "None"}
English Proficiency Variant: ${current.mx_English_Proficiency_Variant || "None"}
FAFSA Variant: ${current.mx_FAFSA_Ack_Variant || "None"}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are an Admissions Intake QA Agent.

CRITICAL:
- If Citizenship is US Citizen or Permanent Resident → English proficiency is NOT required.
- Do NOT flag English docs missing for US / PR.
- Always return ALL fields.

Output STRICT JSON:
{
  "QA_Status": "PASS | REVIEW | FAIL",
  "QA_Risk_Level": "LOW | MEDIUM | HIGH",
  "QA_Summary": "",
  "QA_Key_Findings": [],
  "QA_Concerns": [],
  "QA_Advisory_Notes": ""
}
`
        },
        { role: "user", content: context }
      ]
    });

    const qa = JSON.parse(response.choices[0].message.content);

    return res.status(200).json({
      status: "INTAKE_QA_COMPLETED",
      QA_Status: qa.QA_Status || "REVIEW",
      QA_Risk_Level: qa.QA_Risk_Level || "MEDIUM",
      QA_Summary: qa.QA_Summary || "",
      QA_Key_Findings: qa.QA_Key_Findings || [],
      QA_Concerns: qa.QA_Concerns || [],
      QA_Advisory_Notes: qa.QA_Advisory_Notes || ""
    });

  } catch (err) {
    console.error("❌ QA ERROR", err);
    return res.status(200).json({
      status: "INTAKE_QA_FAILED",
      error: err.message
    });
  }
});

/* ===============================
   HEALTH
================================ */

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

/* ===============================
   SERVER
================================ */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Intake QA Agent live on ${PORT}`);
});
