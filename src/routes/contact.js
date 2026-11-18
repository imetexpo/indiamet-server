const express = require("express");
const router = express.Router();
const emailService = require("../services/EmailService");
const passService = require("../services/PassService");
const modelFactory = require("../models");
const QRCode = require('qrcode');

let contactTableReady = false;

async function saveContactSubmission(formType, data, emailStatus = "pending") {
  try {
    const models = await modelFactory.init();
    const ContactSubmission = models.ContactSubmission;
    if (!ContactSubmission) return null;

    if (!contactTableReady) {
      await ContactSubmission.sync().catch(() => null);
      contactTableReady = true;
    }

    const name =
      data.contactPerson ||
      data.name ||
      [data.firstName, data.lastName].filter(Boolean).join(" ").trim() ||
      null;

    const submission = await ContactSubmission.create({
      formType,
      email: data.email,
      name,
      phone: data.phone || data.mobile || null,
      company: data.companyName || data.company || null,
      payload: data,
      emailStatus
    });
    console.log(`✅ Contact submission stored (${formType}) for ${data.email}`);
    return submission;
  } catch (dbError) {
    console.warn("Contact submission DB save warning:", dbError.message);
    return null;
  }
}

function publicBackendUrl() {
  return (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
}

function passPageUrl(visitorCode) {
  return `${publicBackendUrl()}/api/contact/pass/${encodeURIComponent(visitorCode)}`;
}

function badgeImageUrl(visitorCode) {
  return `${publicBackendUrl()}/api/contact/visitor/${encodeURIComponent(visitorCode)}/badge`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function findRegistrationByCode(code) {
  try {
    const models = await modelFactory.init();
    const ContactSubmission = models.ContactSubmission;
    if (ContactSubmission) {
      const sequelize = ContactSubmission.sequelize;
      const row = await ContactSubmission.findOne({
        where: sequelize.where(
          sequelize.fn(
            "JSON_UNQUOTE",
            sequelize.fn("JSON_EXTRACT", sequelize.col("payload"), "$.visitorCode")
          ),
          code
        ),
        order: [["createdAt", "DESC"]],
      });
      if (row) {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload || {});
        return { formType: row.formType, payload };
      }
    }
  } catch (err) {
    console.warn("findRegistrationByCode in ContactSubmission error:", err.message);
  }

  // Fallback to passService / VisitorPass
  try {
    const pass = await passService.getPassByCode(code);
    if (pass) {
      return {
        formType: pass.type === "delegate" ? "delegate-registration" : "visitor-registration",
        payload: {
          firstName: pass.name ? pass.name.split(" ")[0] : "",
          lastName: pass.name ? pass.name.split(" ").slice(1).join(" ") : "",
          name: pass.name,
          email: pass.email,
          phone: pass.phone,
          company: pass.company,
          designation: pass.designation,
          city: pass.city,
          state: pass.state,
          country: pass.country,
          visitorCode: pass.registrationNumber,
        }
      };
    }
  } catch (err) {
    console.warn("findRegistrationByCode in passService error:", err.message);
  }

  return null;
}

function renderPassPage({ code, formType, payload }) {
  const data = payload || {};
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Visitor";
  const kind = formType === "delegate-registration" ? "Delegate" : "Visitor";
  const rows = [
    ["Name", name],
    ["Email", data.email],
    ["Phone", data.mobile || data.phone],
    ["Company", data.company || data.companyName],
    ["Designation", data.designation],
    ["City", data.city],
    ["State", data.state],
    ["Country", data.country],
    ["Visitor code", code],
    ["Pass type", kind],
    ["Event", "IndiaMET 2027"],
    ["Dates", "13–15 May 2027"],
    ["Venue", "Auto Cluster Exhibition Centre, Pune, India"],
  ].filter(([, value]) => value);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(name)} · IndiaMET 2027 Pass</title>
</head>
<body style="margin:0; background:#eef3f8; font-family:Arial, sans-serif; color:#003A77;">
  <div style="max-width:520px; margin:24px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px rgba(0,58,119,.12);">
    <div style="background:#003A77; color:#fff; padding:28px 24px; text-align:center;">
      <div style="font-size:13px; letter-spacing:.14em; text-transform:uppercase;">IndiaMET 2027</div>
      <h1 style="margin:10px 0 0; font-size:26px;">${escapeHtml(kind)} Pass</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px; font-size:18px; font-weight:bold; color:#003A77;">${escapeHtml(name)}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="padding:8px 0; color:#5b7086; width:38%;">${escapeHtml(label)}</td>
            <td style="padding:8px 0; font-weight:bold; color:#1e293b;">${escapeHtml(value)}</td>
          </tr>
        `).join("")}
      </table>
      <div style="margin-top:24px; text-align:center;">
        <a href="${badgeImageUrl(code)}?download=1" style="display:inline-block; background:#003A77; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
          Download Pass QR
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Helper function to generate QR code as buffer
async function generateQRCodeBuffer(data) {
  try {
    const qrData = data || "IndiaMet 2027";
    const buffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 200,
      color: {
        dark: '#0F2F5C',
        light: '#FFFFFF'
      },
      type: 'png'
    });
    return buffer;
  } catch (error) {
    console.error("QR Code generation error:", error);
    return null;
  }
}

function renderDetailsCard(data = {}) {
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Not provided";
  const company = data.companyName || data.company || "Not provided";
  const jobTitle = data.jobTitle || data.designation || "Not provided";
  const phone = data.phone || data.mobile || "Not provided";
  const email = data.email || "Not provided";
  const address = [data.address, data.city, data.state, data.country, data.pincode].filter(Boolean).join(", ") || data.address || data.city || "Not provided";

  return `
    <table width="100%" cellpadding="8" cellspacing="0" 
      style="background:#E8F1F8; margin:20px 0; border:1px solid #CBD5E1; border-radius:6px; border-collapse:collapse; font-size:14px; text-align:left;">
      <tr>
        <td width="35%" style="border-bottom:1px solid #CBD5E1; color:#003A77; padding:8px 12px;"><strong>Name</strong></td>
        <td style="border-bottom:1px solid #CBD5E1; font-weight:600; color:#1e293b; padding:8px 12px;">: ${name}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #CBD5E1; color:#003A77; padding:8px 12px;"><strong>Company</strong></td>
        <td style="border-bottom:1px solid #CBD5E1; color:#1e293b; padding:8px 12px;">: ${company}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #CBD5E1; color:#003A77; padding:8px 12px;"><strong>Job Title</strong></td>
        <td style="border-bottom:1px solid #CBD5E1; color:#1e293b; padding:8px 12px;">: ${jobTitle}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #CBD5E1; color:#003A77; padding:8px 12px;"><strong>Phone Number</strong></td>
        <td style="border-bottom:1px solid #CBD5E1; color:#1e293b; padding:8px 12px;">: ${phone}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #CBD5E1; color:#003A77; padding:8px 12px;"><strong>Email</strong></td>
        <td style="border-bottom:1px solid #CBD5E1; color:#1e293b; padding:8px 12px;">: ${email}</td>
      </tr>
      <tr>
        <td style="color:#003A77; padding:8px 12px;"><strong>Address</strong></td>
        <td style="color:#1e293b; padding:8px 12px;">: ${address}</td>
      </tr>
    </table>
  `;
}

function renderSponsorDetailsCard(data = {}) {
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Not provided";
  const company = data.companyName || data.company || "Not provided";
  const jobTitle = data.jobTitle || data.designation || "Not provided";
  const phone = data.phone || data.mobile || "Not provided";
  const email = data.email || "Not provided";
  const address = [data.address, data.city, data.state, data.country, data.pincode].filter(Boolean).join(", ") || data.address || data.city || "Not provided";
  const partnershipType = data.partnershipType ? data.partnershipType.charAt(0).toUpperCase() + data.partnershipType.slice(1) : (data.sponsorshipType || null);

  return `
    <table width="100%" cellpadding="8" cellspacing="0" 
      style="background:#FAF5FF; margin:20px 0; border:1px solid #E9D5FF; border-radius:6px; border-collapse:collapse; font-size:14px; text-align:left;">
      <tr>
        <td width="35%" style="border-bottom:1px solid #E9D5FF; color:#6B21A8; padding:8px 12px;"><strong>Name</strong></td>
        <td style="border-bottom:1px solid #E9D5FF; font-weight:600; color:#1e293b; padding:8px 12px;">: ${name}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #E9D5FF; color:#6B21A8; padding:8px 12px;"><strong>Company</strong></td>
        <td style="border-bottom:1px solid #E9D5FF; color:#1e293b; padding:8px 12px;">: ${company}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #E9D5FF; color:#6B21A8; padding:8px 12px;"><strong>Job Title</strong></td>
        <td style="border-bottom:1px solid #E9D5FF; color:#1e293b; padding:8px 12px;">: ${jobTitle}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #E9D5FF; color:#6B21A8; padding:8px 12px;"><strong>Phone Number</strong></td>
        <td style="border-bottom:1px solid #E9D5FF; color:#1e293b; padding:8px 12px;">: ${phone}</td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #E9D5FF; color:#6B21A8; padding:8px 12px;"><strong>Email</strong></td>
        <td style="border-bottom:1px solid #E9D5FF; color:#1e293b; padding:8px 12px;">: ${email}</td>
      </tr>
      <tr>
        <td style="${partnershipType ? 'border-bottom:1px solid #E9D5FF;' : ''} color:#6B21A8; padding:8px 12px;"><strong>Address</strong></td>
        <td style="${partnershipType ? 'border-bottom:1px solid #E9D5FF;' : ''} color:#1e293b; padding:8px 12px;">: ${address}</td>
      </tr>
      ${partnershipType ? `
      <tr>
        <td style="color:#6B21A8; padding:8px 12px;"><strong>Partnership Type</strong></td>
        <td style="color:#1e293b; font-weight:600; padding:8px 12px;">: ${partnershipType}</td>
      </tr>
      ` : ''}
    </table>
  `;
}

function generateInwardTemplate({
  title,
  lightBg = "#FFFFFF",
  stripColor = "#003A77",
  titleColor = "#003A77",
  data = {},
  includeSpace = false
}) {
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Not provided";
  const company = data.companyName || data.company || "Not provided";
  const jobTitle = data.jobTitle || data.designation || "Not provided";
  const phone = data.phone || data.mobile || "Not provided";
  const email = data.email || "Not provided";
  const address = [data.address, data.city, data.state, data.country, data.pincode].filter(Boolean).join(", ") || data.address || data.city || "Not provided";

  const standardFields = [
    ["Name", name],
    ["Company", company],
    ["Job Title", jobTitle],
    ["Phone Number", phone],
    ["Email", email],
    ["Address", address]
  ];

  const ignoredKeys = new Set([
    'firstName', 'lastName', 'name', 'contactPerson',
    'companyName', 'company',
    'jobTitle', 'designation',
    'phone', 'mobile',
    'email',
    'address', 'city', 'state', 'country', 'pincode', 'postalCode',
    'captchaToken', 'submittedAt', 'standSize', 'spaceRequirement', 'interestLevel',
    'marketingConsent', 'privacyConsent', 'consent', 'marketing',
    'gstin', 'GSTIN',
    'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'utmId',
    'referrer', 'landingPage', 'utmTimestamp',
    'cmsCampaignId', 'cmsCampaignName', 'cmsCampaignSource', 'cmsCampaignMedium'
  ]);

  const extraFields = Object.entries(data)
    .filter(([key]) => !ignoredKeys.has(key))
    .map(([key, value]) => {
      const formattedVal = Array.isArray(value) ? value.join(", ") : (value || "N/A");
      return [key, formattedVal];
    });

  const allRows = [...standardFields, ...extraFields];

  const fields = allRows.map(([label, value]) => `
    <tr>
      <td width="35%" style="padding:7px 0; border-bottom:1px solid #E2E8F0; color:#003A77;"><strong>${label}</strong></td>
      <td style="padding:7px 0; border-bottom:1px solid #E2E8F0; color:#1e293b;">: ${value}</td>
    </tr>
  `).join("");

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:20px 0;">
          <!-- CARD -->
          <table width="600" cellpadding="0" cellspacing="0"
            style="background:#FFFFFF; border-radius:6px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">

            <!-- HEADER (REDUCED PADDING) -->
            <tr>
              <td style="background:#FFFFFF; padding:20px 24px; text-align:center;">
                <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:180px; display:block; margin:0 auto;"
                  alt="IndiaMet Logo"
                />
               </td>
             </tr>

            <!-- STRIP -->
            <tr>
              <td style="background:${stripColor}; height:6px;"></td>
             </tr>

            <!-- TITLE -->
            <tr>
              <td style="background:${titleColor}; color:#fff; text-align:center; padding:12px; font-size:18px; font-weight:bold;">
                ${title}
               </td>
             </tr>

            <!-- CONTENT -->
            <tr>
              <td style="padding:24px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#333;">
                  ${fields}
                 </table>
               </td>
             </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#003A77; padding:15px;">
                <table width="100%">
                  <tr>
                    
                    <!-- LEFT LOGO -->
                    <td align="left">
                      <img 
                        src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                        style="max-width:120px; display:block;"
                        alt="Maxx Business Media Logo"
                      />
                     </td>

                    <!-- RIGHT TEXT -->
                    <td align="right" style="color:#fff; font-size:12px; line-height:1.5;">
                      <strong>13-15 May 2027</strong><br/>
                      Auto Cluster Exhibition Centre, Pune<br/>
                      Maxx Business Media Pvt Ltd<br/>
                      Bengaluru, India
                     </td>

                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

  </body>
  </html>
  `;
}

router.get("/pass/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();
    const registration = await findRegistrationByCode(code);
    if (!registration) {
      return res.status(404).send("Visitor pass not found");
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(renderPassPage({ code, ...registration }));
  } catch (error) {
    console.error("Pass page error:", error);
    return res.status(500).send("Could not load visitor details");
  }
});

router.get("/visitor/:code/badge", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) {
      return res.status(400).send("Visitor code is required");
    }

    const registration = await findRegistrationByCode(code);
    const kind = registration?.formType === "delegate-registration" ? "Delegate" : "Visitor";
    const qrContent = passPageUrl(code);
    const buffer = await generateQRCodeBuffer(qrContent);

    if (!buffer) {
      return res.status(500).send("Could not generate badge");
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    if (req.query.download === "1") {
      res.set(
        "Content-Disposition",
        `attachment; filename="indiamet-2027-${kind.toLowerCase()}-badge.png"`
      );
    }
    return res.send(buffer);
  } catch (error) {
    console.error("Badge image error:", error);
    return res.status(500).send("Could not generate badge");
  }
});

router.get("/visitor/:code", async (req, res) => {
  try {
    const Visitor = require("../models/Visitor");
    const visitor = await Visitor.findOne({
      visitorCode: req.params.code
    });

    if (!visitor) {
      return res.status(404).json({ message: "Visitor not found" });
    }

    res.json(visitor);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/visitors/all", async (req, res) => {
  try {
    let Visitor;
    try {
      Visitor = require("../models/Visitor");
    } catch (e) {
      return res.status(200).json({ success: true, total: 0, checkedIn: 0 });
    }

    const allVisitors = await Visitor.find({});
    const checkedInVisitors = await Visitor.find({ checkedIn: true });

    res.json({
      success: true,
      total: allVisitors.length,
      checkedIn: checkedInVisitors.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get recent check-ins
router.get("/visitors/checked-in", async (req, res) => {
  try {
    let Visitor;
    try {
      Visitor = require("../models/Visitor");
    } catch (e) {
      return res.status(200).json({ success: true, visitors: [] });
    }

    const checkedInVisitors = await Visitor.find({ checkedIn: true })
      .sort({ checkInTime: -1 })
      .limit(20);

    res.json({
      success: true,
      visitors: checkedInVisitors.map(v => ({
        name: `${v.firstName || ''} ${v.lastName || ''}`.trim(),
        company: v.company || 'N/A',
        checkInTime: v.checkInTime,
        visitorCode: v.visitorCode
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Visitor check-in endpoint
router.post("/visitor/checkin", async (req, res) => {
  try {
    const { visitorCode } = req.body;

    if (!visitorCode) {
      return res.status(400).json({
        success: false,
        message: "Visitor code is required"
      });
    }

    let Visitor;
    try {
      Visitor = require("../models/Visitor");
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "Visitor model not found"
      });
    }

    const visitor = await Visitor.findOne({ visitorCode });

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found"
      });
    }

    if (visitor.checkedIn) {
      return res.status(400).json({
        success: false,
        message: "Visitor already checked in",
        alreadyCheckedIn: true,
        checkInTime: visitor.checkInTime
      });
    }

    // Update visitor check-in status
    visitor.checkedIn = true;
    visitor.checkInTime = new Date();
    await visitor.save();

    res.json({
      success: true,
      message: "Visitor checked in successfully",
      visitor: {
        firstName: visitor.firstName,
        lastName: visitor.lastName,
        company: visitor.company,
        email: visitor.email,
        visitorCode: visitor.visitorCode,
        checkInTime: visitor.checkInTime
      }
    });

  } catch (err) {
    console.error("Check-in error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
});


router.post("/", async (req, res) => {
  try {
    const { formType, captchaToken, submittedAt, verificationToken, ...data } = req.body;

    if (!formType) {
      return res.status(400).json({ success: false, message: "Form type missing" });
    }

    if (!data.email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email address is required" 
      });
    }

    // Log received data for debugging
    console.log(`📝 Received ${formType} form submission:`, {
      email: data.email,
      firstName: data.firstName || data.name,
      formType
    });

    let subject = "";
    let html = "";
    let visitorCode = null;
    let qrCodeBuffer = null;
    let badgeUrl = "";
    let badgeDownloadUrl = "";
    let issued = null;

    // Issue digital pass and generate QR code for visitor and delegate registrations
    if (formType === "visitor-registration" || formType === "delegate-registration") {
      try {
        issued = await passService.issueContactPass({ formType, data, verificationToken });
        visitorCode = issued.pass.registrationNumber;
        data.visitorCode = visitorCode;
        data.passUrl = issued.pass.passUrl;
      } catch (passErr) {
        console.warn("Could not issue digital pass via PassService, falling back:", passErr.message);
        visitorCode = data.visitorCode || `indiamet-${Date.now()}`;
        data.visitorCode = visitorCode;
      }

      badgeUrl = badgeImageUrl(visitorCode);
      badgeDownloadUrl = issued?.pass?.passUrl || `${badgeUrl}?download=1`;

      const qrContent = passPageUrl(visitorCode);
      qrCodeBuffer = await generateQRCodeBuffer(qrContent);
    }

    const submission = await saveContactSubmission(formType, data, "pending");

    // Safely access data with fallbacks to prevent undefined errors
    switch (formType) {
            case "event-brochure":
        subject = "Your Event Brochure - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED) -->
              <tr>
                <td align="center" style="background:#D7EEFB; padding:20px 0 0;">

                  <!-- BLUE HEADER (REDUCED PADDING) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <!-- CONTENT -->
                    <tr>
                      <td style="padding:30px; color:#333; text-align:center;">

                        <p style="text-align:left; font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Customer'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for requesting the <strong>IndiaMET 2027</strong> Event Brochure. Below are your submitted details:
                        </p>

                        ${renderDetailsCard(data)}

                        <!-- IMAGE -->
                        <div style="margin:25px 0;">
                          <img 
                            src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" 
                            alt="IndiaMET 2027 Brochure"
                            style="width:100%; max-width:400px; border-radius:6px;"
                          />
                        </div>

                        <!-- BUTTON -->
                        <div style="margin:25px 0;">
                          <a href="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793947874/IndiaMet_Brochure_compressed_ex2v66.pdf"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:14px 32px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:15px;
                               display:inline-block;
                               font-weight:bold;
                             ">
                            Download Brochure
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your copy.
                          </p>
                        </div>

                        <p style="font-size:14px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMET 2027 Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      case "post-show-report":
        subject = "Your Post Show Report - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED) -->
              <tr>
                <td align="center" style="background:#D7EEFB; padding:20px 0 0;">

                  <!-- BLUE HEADER (REDUCED PADDING) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <!-- CONTENT -->
                    <tr>
                      <td style="padding:30px; color:#333; text-align:center;">

                        <p style="text-align:left; font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Customer'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for requesting the <strong>IndiaMET 2027</strong> Post Show Report. Below are your submitted details:
                        </p>

                        ${renderDetailsCard(data)}

                        <!-- IMAGE -->
                        <div style="margin:25px 0;">
                          <img 
                            src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" 
                            alt="Post Show Report"
                            style="width:100%; max-width:400px; border-radius:6px;"
                          />
                        </div>

                        <!-- BUTTON -->
                        <div style="margin:25px 0;">
                          <a href="https://drive.google.com/your-post-show-report-link"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:14px 32px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:15px;
                               display:inline-block;
                               font-weight:bold;
                             ">
                            Download Report
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your copy.
                          </p>
                        </div>

                        <p style="font-size:14px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMET 2027 Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      case "visitor-registration":
        subject = "Visitor Registration Confirmed - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED) -->
              <tr>
                <td align="center" style="background:#D7EEFB; padding:20px 0 0;">

                  <!-- BLUE HEADER (REDUCED PADDING) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <!-- CONTENT -->
                    <tr>
                      <td style="padding:30px; color:#333; text-align:center;">

                        <h2 style="margin-bottom:10px; color:#003A77;">Visitor Registration Confirmed!</h2>
                        <hr style="border:none; border-top:1px solid #ddd; width:80%; margin:10px auto 20px;" />

                        <p style="text-align:left; font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Visitor'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for registering to attend <strong>IndiaMET 2027</strong>.<br/>
                          Below are your registration details and visitor badge:
                        </p>

                        ${renderDetailsCard(data)}

                        <!-- QR CODE BADGE -->
                        <div style="margin:25px 0; text-align:center;">
                          <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1); border:1px solid #CBD5E1;">
                            <img src="cid:qrcode_${visitorCode}" alt="Visitor QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                            <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMET 2027 Visitor Pass</p>
                            <p style="margin:5px 0; font-size:12px; color:#666;">${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || ''}</p>
                            <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                            <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the visitor details.</p>
                          </div>
                        </div>

                        <!-- BUTTON - Download link -->
                        <div style="margin:25px 0;">
                          <a href="${badgeDownloadUrl}"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:14px 34px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:15px;
                               display:inline-block;
                               font-weight:bold;
                               cursor:pointer;
                             ">
                            Download Badge
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your visitor badge with QR code.
                          </p>
                        </div>

                        <div style="margin-top:15px; font-size:15px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px; color:#003A77;">
                          Visitor Code: ${visitorCode}
                        </div>

                        <p style="font-size:15px; margin-top:20px;">
                          We look forward to seeing you at the event.
                        </p>

                        <p style="font-size:13px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMET 2027 Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      case "exhibitor-enquiry":
        subject = "Your Exhibitor Enquiry - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED) -->
              <tr>
                <td align="center" style="background:#D7EEFB; padding:20px 0 0;">

                  <!-- BLUE HEADER (REDUCED PADDING) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <!-- CONTENT -->
                    <tr>
                      <td style="padding:30px; color:#333;">

                        <p style="font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Exhibitor'},
                        </p>

                        <p style="font-size:16px; line-height:1.6;">
                          Thank you for your enquiry about exhibiting at <strong>IndiaMET 2027 – Dedicated Industrial Metrology Exhibition &amp; Summit</strong>.
                        </p>

                        <p style="font-size:16px;">
                          We have received your exhibiting enquiry details as follows:
                        </p>

                        ${renderDetailsCard(data)}

                        <p style="font-size:15px; line-height:1.6;">
                          Our exhibition sales team will get in touch with you shortly to discuss booth space options, floor plan availability, and provide full participation packages.
                        </p>

                        <p style="font-size:15px;">
                          We look forward to the opportunity to collaborate with you at 
                          <strong style="color:#003A77;">IndiaMET 2027!</strong>
                        </p>

                        <p style="margin-top:20px;">
                          Best regards,<br/>
                          <strong style="color:#003A77;">IndiaMET 2027 Exhibition Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      case "delegate-registration":
        subject = "Delegate Registration Confirmed - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED) -->
              <tr>
                <td align="center" style="background:#D7EEFB; padding:20px 0 0;">

                  <!-- BLUE HEADER (REDUCED PADDING) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <tr>
                      <td style="padding:30px; text-align:center; color:#333;">

                        <h2 style="margin-bottom:10px; color:#003A77;">Delegate Registration Confirmed!</h2>
                        <hr style="border:none; border-top:1px solid #ddd; width:80%; margin:10px auto 20px;" />

                        <p style="text-align:left; font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Delegate'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for registering to attend 
                          <strong>IndiaMET 2027 Conference</strong>.<br/>
                          Below are your registration details and delegate pass:
                        </p>

                        ${renderDetailsCard(data)}

                        <div style="margin:25px 0; text-align:center;">
                          <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1); border:1px solid #CBD5E1;">
                            <img src="cid:qrcode_${visitorCode}" alt="Delegate QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                            <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMET 2027 Delegate Pass</p>
                            <p style="margin:5px 0; font-size:12px; color:#666;">${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || ''}</p>
                            <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                            <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the delegate details.</p>
                          </div>
                        </div>

                        <!-- BUTTON - Download link -->
                        <div style="margin:25px 0;">
                          <a href="${badgeDownloadUrl}"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:14px 34px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:15px;
                               display:inline-block;
                               font-weight:bold;
                               cursor:pointer;
                             ">
                            Download Badge
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your delegate badge with QR code.
                          </p>
                        </div>

                        <div style="margin-top:15px; font-size:15px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px; color:#003A77;">
                          Delegate Code: ${visitorCode}
                        </div>

                        <p style="margin-top:20px; font-size:15px;">We look forward to seeing you at the event.</p>

                        <p style="font-size:13px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMET 2027 Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      case "sponsor-registration":
      case "partner-registration":
        subject = "Your Sponsorship & Partner Registration - IndiaMET 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND (REDUCED PURPLE TINT - NOT MET BLUE) -->
              <tr>
                <td align="center" style="background:#F5F3FF; padding:20px 0 0;">

                  <!-- PURPLE HEADER (DISTINCTIVE FROM MET BLUE) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:linear-gradient(135deg, #581C87 0%, #7E22CE 100%); border-radius:6px 6px 0 0; color:#fff;">
                    
                    <tr>
                      <td align="center" style="padding:20px 24px;">
                        <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="IndiaMET 2027 Logo"
                        />
                        <p style="margin:6px 0 0; font-size:13px; color:#ffffff; font-weight:600;">
                          India's Dedicated Industrial Metrology Exhibition And Summit
                        </p>
                        <p style="margin:4px 0 0; font-size:11px; color:#E9D5FF; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">
                          Sponsorship &amp; Partnership Programme
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

              <!-- WHITE CARD BODY -->
              <tr>
                <td align="center">

                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#ffffff; border-radius:0 0 6px 6px;">

                    <!-- CONTENT -->
                    <tr>
                      <td style="padding:30px; color:#333;">

                        <h2 style="margin-bottom:10px; color:#581C87; text-align:center;">Sponsorship &amp; Partner Registration Confirmed! 🤝</h2>
                        <hr style="border:none; border-top:1px solid #E9D5FF; width:80%; margin:10px auto 20px;" />

                        <p style="font-size:16px;">
                          Dear ${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || 'Valued Partner'},
                        </p>

                        <p style="font-size:16px; line-height:1.6;">
                          Thank you for your interest in partnering with and sponsoring <strong>IndiaMET 2027 – Dedicated Industrial Metrology Exhibition &amp; Summit</strong>.
                          Below are your registration details:
                        </p>

                        ${renderSponsorDetailsCard(data)}

                        <div style="background:#FAF5FF; border-left:4px solid #7E22CE; padding:18px 20px; margin:22px 0; border-radius:6px; font-size:14px; line-height:1.6;">
                          <strong style="color:#581C87; font-size:15px;">🤝 Sponsor &amp; Partner Next Steps:</strong>
                          <ul style="margin:8px 0 0; padding-left:20px; color:#4B5563;">
                            <li>Our partnership management team will review your application within 1-2 business days.</li>
                            <li>You will receive an email with official IndiaMET 2027 partner branding guidelines and deliverables.</li>
                            <li>A dedicated account manager will be assigned to assist your team with customized booth placement and branding.</li>
                            <li>We will schedule a briefing call to align on promotional timelines and VIP delegate passes.</li>
                          </ul>
                        </div>

                        <p style="font-size:14px; color:#666;">
                          If you have any questions, feel free to contact us at pad@maxxmedia.in.
                        </p>

                        <p style="margin-top:20px;">
                          Best regards,<br/>
                          <strong style="color:#6B21A8;">IndiaMET 2027 Sponsorship &amp; Partnerships Team</strong>
                        </p>

                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td style="background:#581C87; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
                      </td>
                    </tr>

                    <tr>
                      <td style="background:#F5F3FF; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                          src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                          style="max-width:180px; display:block; margin:0 auto;"
                          alt="Maxx Business Media Logo"
                        /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>

          </body>
          </html>
        `;
        break;

      default:
        subject = "Your Form Submission - IndiaMet 2027";
        html = `
          <h2>Thank you for your submission</h2>
          <p>Dear ${data.firstName || 'Valued Customer'},</p>
          <p>We have received your form submission. Here's what you submitted:</p>
          <hr/>
          ${Object.entries(data)
            .filter(([key]) => !['captchaToken', 'submittedAt'].includes(key))
            .map(([key, value]) => `<p><strong>${key}:</strong> ${Array.isArray(value) ? value.join(', ') : value || 'Not provided'}</p>`)
            .join('')}
          <hr/>
          <p>Our team will review your submission and get back to you shortly.</p>
        `;
    }

    // Validate email before sending
    if (!data.email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required"
      });
    }

    // Send email to user with their submitted details
    console.log(`📧 Sending email to user: ${data.email}`);

    // Prepare email options with attachments for QR code
    if ((formType === "visitor-registration" || formType === "delegate-registration") && qrCodeBuffer) {
      // Use the attachment method from EmailService
      await emailService.sendEmailWithAttachment({
        to: data.email,
        subject: subject,
        html: html,
        attachment: {
          filename: `qrcode_${visitorCode}.png`,
          content: qrCodeBuffer,
          cid: `qrcode_${visitorCode}`,
          contentType: 'image/png'
        }
      });
    } else {
      await emailService.sendEmail(data.email, subject, html);
    }
    console.log(`✅ User email sent successfully to ${data.email}`);

    // Send notification to admin
    try {
      const adminEmail = 'pad9742@gmail.com';
      console.log(`📧 Sending admin notification to ${adminEmail}`);

      // Generate admin email HTML using the same template - FIXED: Removed "None" from template
      let adminHtml = "";
      let adminSubject = "Exhibitor Enquiry - IndiaMet 2027";

      switch (formType) {
        case "delegate-registration":
          adminSubject = "Delegate Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "New Delegate Registration !",
            lightBg: "#FFFFFF",
            stripColor: "#F2E3E7",
            titleColor: "#A84C7D",
            data: { ...data, visitorCode: visitorCode || 'N/A' }
          });
          break;

        case "exhibitor-enquiry":
          adminSubject = "Exhibitor Enquiry - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Exhibitor Enquiry !",
            lightBg: "#FFFFFF",
            stripColor: "#CFE3EE",
            titleColor: "#1F3F4F",
            data,
            includeSpace: true
          });
          break;

        case "event-brochure":
          adminSubject = "Brochure Download - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Brochure Download !",
            lightBg: "#FFFFFF",
            stripColor: "#EAD6B8",
            titleColor: "#93ddd8ff",
            data
          });
          break;

        case "post-show-report":
          adminSubject = "Post Show Report - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Post Show Report Download !",
            lightBg: "#FFFFFF",
            stripColor: "#DDE5B2",
            titleColor: "#00e4f4ff",
            data
          });
          break;

        case "visitor-registration":
          adminSubject = "New Visitor Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "New Visitor Registration - IndiaMet 2027",
            lightBg: "#FFFFFF",
            stripColor: "#00A1B1",
            titleColor: "#003A77",
            data: { ...data, visitorCode: visitorCode || 'N/A' }
          });
          break;

        case "sponsor-registration":
        case "partner-registration":
          adminSubject = "New Sponsor / Partner Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "New Sponsor / Partner Registration !",
            lightBg: "#FFFFFF",
            stripColor: "#7E22CE",
            titleColor: "#581C87",
            data
          });
          break;

        default:
          adminSubject = "Exhibitor Enquiry - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "New Form Submission",
            lightBg: "#FFFFFF",
            stripColor: "#e0e0e0",
            titleColor: "#333",
            data
          });
      }

      await emailService.sendEmail(
        adminEmail,
        adminSubject,
        adminHtml
      );
      console.log(`✅ Admin notification sent to ${adminEmail}`);
    } catch (adminError) {
      console.error("❌ Admin notification failed:", adminError);
      // Don't fail the request if admin notification fails
    }

    if (submission) {
      await submission.update({ emailStatus: 'sent' }).catch(() => null);
    }

    return res.status(200).json({
      success: true,
      message: "Form submitted successfully. Please check your email for confirmation.",
      visitorCode: visitorCode || null,
      ...(issued ? { pass: issued.pass, delivery: issued.delivery } : {})
    });

  } catch (error) {
    console.error("❌ Contact API Error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// Add a test endpoint
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Contact API is working",
    timestamp: new Date().toISOString(),
    environment: {
      hasSendGridKey: !!process.env.SENDGRID_API_KEY,
      hasSendGridFrom: !!process.env.SENDGRID_FROM
    }
  });
});

module.exports = router;