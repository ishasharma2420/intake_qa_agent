import express from "express";

const app = express();
app.use(express.json());

// =======================
// Intake QA Webhook Entry
// =======================

app.post("/intake-qa-agent", async (req, res) => {
  try {
    /**
     * EXPECTED PAYLOAD FROM LEADSQUARED WEBHOOK
     * (Same pattern as AI Intent Classifier)
     */
    const {
      email,
      leadGuid,          // optional, for logging
      activityId,        // optional, for traceability
      intake_status,     // e.g. "Under Review"
      declared_gpa,
      program,
      documents          // optional for now (OCR later)
    } = req.body;

    // -----------------------
    // Basic validation
    // -----------------------
    if (!email) {
      return res.status(400).json({
        error: "email is required in webhook payload"
      });
    }

    // -----------------------
    // TEMP: Echo payload back
    // (This proves LSQ → Render works)
    // -----------------------
    console.log("===== INTAKE QA WEBHOOK RECEIVED =====");
    console.log(JSON.stringify(req.body, null, 2));

    /**
     * NEXT STEPS (we will add after this works):
     * 1. OCR documents (external service)
     * 2. Call Intake QA LLM
     * 3. Return structured QA output
     */

    return res.json({
      status: "WEBHOOK_RECEIVED_SUCCESSFULLY",
      email,
      activityId,
      intake_status,
      declared_gpa,
      program,
      message: "Ready for OCR + Intake QA processing"
    });

  } catch (err) {
    console.error("INTAKE QA AGENT ERROR:", err);

    return res.status(500).json({
      error: "Internal server error in Intake QA Agent",
      details: err.message
    });
  }
});

// =======================
// Render Port Binding
// =======================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent listening on port ${PORT}`);
});
