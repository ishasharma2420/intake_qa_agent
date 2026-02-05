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

return res.json({
  status: "LEAD_FETCH_SUCCESS",
  lead
});

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
});

// ✅ REQUIRED for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
