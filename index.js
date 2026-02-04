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
1. Evaluate whether the uploaded documents sufficiently support the declared application data.
2. Identify ambiguities or inconsistencies that may slow or block human review.
3. Flag explicit review risks with clear reasons and recommended human actions.
4. Produce a concise, human-readable QA summary for admissions staff.

You MUST:
- Be conservative.
- Avoid speculation.
- Avoid scoring or probability language.
- Avoid approval or rejection decisions.

You MUST NOT:
- Change application data.
- Recommend acceptance or rejection.
- Invent missing information.

If no meaningful risks or ambiguities are found, explicitly state that the application appears review-ready.

Your output MUST follow the provided JSON schema exactly.
Do not include any text outside the JSON response.
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

Return output strictly in the required JSON schema.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    const data = await response.json();
    // SAFETY CHECK: Log full OpenAI response
console.log("OpenAI raw response:", JSON.stringify(data, null, 2));

// Handle OpenAI API errors
if (!data.choices || !data.choices[0]) {
  return res.status(500).json({
    error: "Invalid response from OpenAI",
    openai_response: data
  });
}

const output = data.choices[0].message.content;

// Handle malformed JSON from model
try {
  res.json(JSON.parse(output));
} catch (e) {
  res.status(500).json({
    error: "Failed to parse model output as JSON",
    raw_output: output
  });
}
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "QA Agent execution failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
