import express from "express";
import OpenAI from "openai";
import axios from "axios";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const LS_BASE = "https://api.leadsquared.com/v2";
const LS_ACCESS_KEY = process.env.LS_ACCESS_KEY;
const LS_SECRET_KEY = process.env.LS_SECRET_KEY;

/* =========================
   WRITE BACK TO LEADSQUARED
========================= */

async function updateLeadSquared(prospectId, activityId, qa) {
  const payload = {
    ProspectId: prospectId,
    ActivityId: activityId,
    Fields: {
      QA_Status: qa.QA_Status,
      QA_Risk_Level: qa.QA_Risk_Level,
      QA_Summary: qa.QA_Summary,
      QA_Advisory_Notes: qa.QA_Advisory_Notes,
      QA_Key_Findings: qa.QA_Key_Findings.join(" | "),
      QA_Concerns: qa.QA_Concerns.join(" | "),
      QA_Run_Completed: "Yes"
    }
  };

  await axios.post(
    `${LS_BASE}/ProspectActivity/Update?accessKey=${LS_ACCESS_KEY}&secretKey=${LS_SECRET_KEY}`,
    payload
  );
}

/* =========================
   LLM QA
========================= */

async function runIntakeQA(context) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: "Return STRICT JSON only." },
      { role: "user", content: context }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

/* =========================
   WEBHOOK
========================= */

app.post("/intake-qa-agent", async (req, res) => {
  const body = req.body || {};

  console.log("==== WEBHOOK RECEIVED ====");
  console.log("Keys:", Object.keys(body));

  // Ignore follow-up pings
  if (!body.ActivityEventName || body.ActivityEventName !== "Application Intake") {
    console.log("↩️ Follow-up / sync ping detected. ACK only.");
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }

  try {
    console.log("✅ Application Intake detected");

    const prospectId = body.Current?.ProspectID;
    const activityId = body.ProspectActivityId;

    const context = JSON.stringify(body, null, 2);
    const qa = await runIntakeQA(context);

    await updateLeadSquared(prospectId, activityId, qa);

    console.log("✅ QA written back to LeadSquared");

    return res.status(200).json({ status: "ACKNOWLEDGED" });

  } catch (err) {
    console.error("❌ QA ERROR", err);
    return res.status(200).json({ status: "ACKNOWLEDGED" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ Intake QA Agent running on port ${PORT}`)
);
