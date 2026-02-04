import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/intake-qa-agent", async (req, res) => {
  try {
    const {
      application_metadata,
      program_intent,
      declared_data,
      documents
    } = req.body;

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

// ✅ REQUIRED for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
