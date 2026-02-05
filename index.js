import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// =======================
// LeadSquared API Helpers
// =======================

const LSQ_HOST = process.env.LSQ_HOST;
const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;

async function lsqGet(endpoint, params = {}) {
  const response = await axios.get(`${LSQ_HOST}${endpoint}`, {
    params: {
      accessKey: LSQ_ACCESS_KEY,
      secretKey: LSQ_SECRET_KEY,
      ...params
    }
  });
  return response.data;
}

async function fetchLead(leadId) {
  return await lsqGet(
    "/v2/LeadManagement.svc/Leads.Get",
    { leadId }
  );
}

async function fetchActivity(activityId) {
  return await lsqGet(
    "/v2/ActivityManagement.svc/Activity.Get",
    { activityId }
  );
}

async function fetchActivityFiles(activityId) {
  return await lsqGet(
    "/v2/ActivityManagement.svc/Activity.GetFileAttachments",
    { activityId }
  );
}

app.post("/intake-qa-agent", async (req, res) => {
  try {
    const { leadId, activityId } = req.body;

    if (!leadId || !activityId) {
      return res.status(400).json({
        error: "leadId and activityId are required"
      });
    }

    const lead = await fetchLead(leadId);
    const activity = await fetchActivity(activityId);
    const files = await fetchActivityFiles(activityId);

    console.log("===== LEAD DATA =====");
    console.log(JSON.stringify(lead, null, 2));

    console.log("===== ACTIVITY DATA =====");
    console.log(JSON.stringify(activity, null, 2));

    console.log("===== FILE ATTACHMENTS =====");
    console.log(JSON.stringify(files, null, 2));

    return res.json({
      status: "LSQ_FETCH_SUCCESS",
      leadFound: !!lead,
      activityFound: !!activity,
      fileCount: files?.length || 0
    });
 } catch (error) {
  const lsqError = error?.response?.data || error.message;

  console.error("LSQ FETCH ERROR FULL:", JSON.stringify(lsqError, null, 2));

  return res.status(500).json({
    error: "Failed to fetch data from LeadSquared",
    details: lsqError
  });
}
/*
    const systemPrompt = `
You are an admissions Intake QA Agent for a US education institution.

Your role is NOT to approve or reject applications.

Your role is to:
1. Evaluate whether uploaded documents sufficiently support declared application data.
2. Identify ambiguities or inconsistencies that may slow human review.
3. Flag explicit review risks with clear reasons and recommended human actions.
4. Produce a concise, human-readable QA summary.

Rules:
- Be conservative.
- Do NOT speculate.
- Do NOT score or rank.
- Do NOT approve or reject.
- Output STRICT JSON only.
`;

    const userPrompt = `
APPLICATION METADATA:
${JSON.stringify(application_metadata, null, 2)}

PROGRAM INTENT:
${JSON.stringify(program_intent, null, 2)}

DECLARED APPLICATION DATA:
${JSON.stringify(declared_data, null, 2)}

SUPPORTING DOCUMENTS:
${JSON.stringify(documents, null, 2)}

Return output strictly in this JSON schema:

{
  "qa_completion_status": "Completed",
  "review_risks": [
    {
      "risk_type": "string",
      "reason": "string",
      "recommended_action": "string"
    }
  ],
  "qa_summary": "string"
}
`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      }
    );

    const data = await openaiResponse.json();

    // 🔎 Log raw OpenAI response for safety
    console.log("OpenAI raw response:", JSON.stringify(data, null, 2));

    // ❌ OpenAI error handling
    if (data.error) {
      return res.status(500).json({
        error: "OpenAI API error",
        details: data.error
      });
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({
        error: "Invalid OpenAI response structure",
        openai_response: data
      });
    }

    // 🧹 Clean model output
    let output = data.choices[0].message.content || "";
    output = output
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(output);
      return res.json(parsed);
    } catch (parseError) {
      return res.status(500).json({
        error: "Failed to parse model output as JSON",
        raw_output: output
      });
    }

  } catch (err) {
    console.error("Unhandled server error:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: err.message
    });
  }
});

*/

// ✅ REQUIRED for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
