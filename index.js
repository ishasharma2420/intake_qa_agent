import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// =======================
// ENV CONFIG
// =======================

const LSQ_HOST = process.env.LSQ_HOST; // https://api-us11.leadsquared.com
const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;

// =======================
// GENERIC LSQ CALL
// =======================

async function lsqPost(endpoint, body = {}) {
  const response = await axios.post(
    `${LSQ_HOST}${endpoint}`,
    body,
    {
      params: {
        accessKey: LSQ_ACCESS_KEY,
        secretKey: LSQ_SECRET_KEY
      },
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
  return response.data;
}

// =======================
// FETCH LEAD BY EMAIL
// =======================

async function fetchLeadByEmail(email) {
  return await lsqPost(
    "/v2/LeadManagement.svc/Leads.GetByEmail",
    {
      EmailAddresses: [email]
    }
  );
}


// =======================
// API ENDPOINT
// =======================

app.post("/intake-qa-agent", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "email is required"
      });
    }

    const leadResponse = await fetchLeadByEmail(email);

    if (!Array.isArray(leadResponse) || leadResponse.length === 0) {
      return res.status(404).json({
        error: "No lead found for this email"
      });
    }

    // LeadSquared always returns an array
    const lead = leadResponse[0];

    console.log("===== LEAD FETCHED =====");
    console.log(JSON.stringify(lead, null, 2));

    return res.json({
      status: "LEAD_FETCH_SUCCESS",
      prospectId: lead.ProspectID,
      prospectAutoId: lead.ProspectAutoId,
      email: lead.EmailAddress,
      rawLead: lead
    });

  } catch (error) {
    const details = error?.response?.data || error.message;
    console.error("LSQ ERROR:", JSON.stringify(details, null, 2));

    return res.status(500).json({
      error: "Failed to fetch lead from LeadSquared",
      details
    });
  }
});

// =======================
// SERVER
// =======================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Intake QA Agent running on port ${PORT}`);
});
