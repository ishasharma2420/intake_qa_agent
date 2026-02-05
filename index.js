import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// =======================
// LeadSquared API Config
// =======================

const LSQ_HOST = process.env.LSQ_HOST; // e.g. https://api-us11.leadsquared.com
const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;

// =======================
// Generic LSQ GET helper
// =======================

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

// =======================
// Lead fetch using GUID
// =======================

async function fetchLeadByGuid(leadGuid) {
  return await lsqGet(
    "/v2/LeadManagement.svc/Leads.GetById",
    {
      id: leadGuid   // 🔴 THIS WAS THE BUG
    }
  );
}

// =======================
// API Route
// =======================

app.post("/intake-qa-agent", async (req, res) => {
  try {
    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({
        error: "leadId (GUID) is required"
      });
    }

    const lead = await fetchLeadByGuid(leadId);

    console.log("===== LEAD DATA FROM LSQ =====");
    console.log(JSON.stringify(lead, null, 2));

    return res.json({
      status: "LEAD_FETCH_SUCCESS",
      lead
    });

  } catch (error) {
    const lsqError = error?.response?.data || error.message;

    console.error(
      "LSQ FETCH ERROR FULL:",
      JSON.stringify(lsqError, null, 2)
    );

    return res.status(500).json({
      error: "Failed to fetch data from LeadSquared",
      details: lsqError
    });
  }
});

// =======================
// Render Port Binding
// =======================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
