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

function generateInwardTemplate({
  title,
  lightBg = "#FFFFFF",
  stripColor = "#003A77",
  titleColor,
  data,
  includeSpace = false
}) {

  // 🔥 Generate dynamic fields - FIXED: Removed "None" concatenation
  const fields = Object.entries(data)
    .filter(([key]) => !['captchaToken', 'submittedAt'].includes(key))
    .map(([key, value]) => {
      if (Array.isArray(value)) value = value.join(", ");
      return `
        <tr>
            <td width="40%" style="padding:6px 0;"><strong>${key}</strong>${''}</td>
            <td style="padding:6px 0;">: ${value || "N/A"}${''}</td>
        </tr>
      `;
    })
    .join("");

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 0;">
          <!-- CARD -->
          <table width="600" cellpadding="0" cellspacing="0"
            style="background:#FFFFFF; border-radius:6px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">

            <!-- HEADER -->
            <tr>
              <td style="background:#FFFFFF; padding:40px 30px; text-align:center;">
                <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet Logo"
                />
               </td>
             </tr>

            <!-- STRIP -->
            <tr>
              <td style="background:${stripColor}; height:30px;"></td>
             </tr>

            <!-- TITLE -->
            <tr>
              <td style="background:${titleColor}; color:#fff; text-align:center; padding:15px; font-size:20px; font-weight:bold;">
                ${title}
               </td>
             </tr>

            <!-- CONTENT -->
            <tr>
              <td style="padding:30px;">
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
        subject = "Your Event Brochure - IndiaMet 2027 ";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND -->
                <tr>
                <td align="center" style="background:#FCD5A6; padding:40px 0 0;">

                  <!-- BLUE HEADER (INSIDE COLOR AREA) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#FFFFFF; border-radius:6px 6px 0 0; color:#fff;">
                    
                      <tr>
                      <td align="center" style="padding:30px;">
                        <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet Logo"
                />
                        <p style="margin:5px 0 0; font-size:14px;">
                          IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit 
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
                      <td style="padding:40px 30px; color:#333; text-align:center;">

                        <p style="text-align:left; font-size:16px;">
                          Dear ${data.firstName || 'Valued Customer'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for requesting <strong>IndiaMet 2027 </strong> Brochure.
                        </p>

                        <!-- IMAGE -->
                        <div style="margin:30px 0;">
                          <img 
                            src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" 
                            alt="IndiaMet 2027 Brochure"
                            style="width:100%; max-width:450px; border-radius:6px;"
                          />
                        </div>

                        <!-- BUTTON -->
                        <div style="margin:30px 0;">
                          <a href="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793947874/IndiaMet_Brochure_compressed_ex2v66.pdf"
                             style="
                               background:#0F2F5C;
                               color:#ffffff;
                               padding:15px 35px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:16px;
                               display:inline-block;
                               font-weight:bold;
                             ">
                            Download Brochure
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your copy.
                          </p>
                        </div>

                        <p style="font-size:15px;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMet 2027 Team</strong>
                        </p>

                         </td>
                       </tr>

                    <!-- FOOTER -->
                      <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>13-15 May 2027 </strong> • Auto Cluster Exhibition Centre, Pune, India
                         </td>
                       </tr>

                      <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="maX Business Media Logo"
                /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91  91483 19993 | pad@maxxmedia.in | wwwindiametexpo.com
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
        subject = "Your Post Show Report - IndiaMet 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND -->
                <tr>
                <td align="center" style="background:#ECF0C6; padding:40px 0 0;">

                  <!-- BLUE HEADER (INSIDE COLOR AREA) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#FFFFFF; border-radius:6px 6px 0 0; color:#fff;">
                    
                      <tr>
                      <td align="center" style="padding:30px;">
                        <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet 2027 Logo"
                />
                        <p style="margin:5px 0 0; font-size:14px;">
                          IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit 
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
                      <td style="padding:40px 30px; color:#333; text-align:center;">

                        <p style="text-align:left; font-size:16px;">
                          Dear ${data.firstName || 'Valued Customer'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for requesting <strong>IndiaMet 2027</strong> Post Show Report.
                        </p>

                        <!-- IMAGE -->
                        <div style="margin:30px 0;">
                          <img 
                            src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" 
                            alt="Post Show Report"
                            style="width:100%; max-width:450px; border-radius:6px;"
                          />
                        </div>

                        <!-- BUTTON -->
                        <div style="margin:30px 0;">
                          <a href="https://drive.google.com/your-post-show-report-link"
                             style="
                               background:#0F2F5C;
                               color:#ffffff;
                               padding:15px 35px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:16px;
                               display:inline-block;
                               font-weight:bold;
                             ">
                            Download Report
                          </a>
                          <p style="font-size:12px; color:#666; margin-top:10px;">
                            Click the button above to download your copy.
                          </p>
                        </div>

                        <p style="font-size:15px;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMet 2027 Team</strong>
                        </p>

                         </td>
                       </tr>

                    <!-- FOOTER -->
                      <tr>
                      <td style="background:#003A77; color:#fff; padding:15px; text-align:center; font-size:14px;">
                        <strong>8-10 Oct 2026</strong> • Auto Cluster Exhibition Centre, Pune, India
                         </td>
                       </tr>

                      <tr>
                      <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333; text-align:center;">
                        Organizer: <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="maX Business Media Logo"
                /><br/>
                        T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                        Tel: +91  91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
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
        subject = "Visitor Registration Confirmed - IndiaMet 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND -->
                <tr>
                <td align="center" style="background:#D7EEFB; padding:40px 0 0;">

                  <!-- BLUE HEADER (INSIDE COLOR AREA) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                      <tr>
                      <td align="center" style="padding:30px;">
                        <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet 2027 Logo"
                />
                        <p style="margin:5px 0 0; font-size:14px; color:#ffffff;">
                         IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit
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
                      <td style="padding:40px 30px; color:#333; text-align:center;">

                        <h2 style="margin-bottom:10px;">Visitor Registration Confirmed !</h2>
                        <hr style="border:none; border-top:1px solid #ddd; width:80%; margin:10px auto 20px;" />

                        <p style="text-align:left; font-size:16px;">
                          Dear ${data.firstName || data.name || data.contactPerson || 'Valued Visitor'},
                        </p>

                        <p style="text-align:left; font-size:16px;">
                          Thank you for registering to attend <strong>IndiaMet 2027</strong>.<br/>
                          Below are your registration details and visitor badge.
                        </p>

                        <!-- QR CODE BADGE -->
                        <div style="margin:30px 0; text-align:center;">
                          <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                            <img src="cid:qrcode_${visitorCode}" alt="Visitor QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                            <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMet 2027 Visitor Pass</p>
                            <p style="margin:5px 0; font-size:12px; color:#666;">${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || ''}</p>
                            <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                            <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the visitor details.</p>
                          </div>
                        </div>

                        <!-- BUTTON - Download link -->
                        <div style="margin:30px 0;">
                          <a href="${badgeDownloadUrl}"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:15px 35px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:16px;
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

                        <div style="margin-top:15px; font-size:16px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px;">
                          Visitor Code: ${visitorCode}
                        </div>

                        <p style="font-size:15px;">
                          We look forward to seeing you at the event.
                        </p>

                        <p style="font-size:13px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMet 2027 Team</strong>
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
                  style="max-width:220px; display:block; margin:0 auto;"
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
        subject = "Your Exhibitor Enquiry - IndiaMet 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND -->
                <tr>
                <td align="center" style="background:#D7EEFB; padding:40px 0 0;">

                  <!-- BLUE HEADER (INSIDE COLOR AREA) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                      <tr>
                      <td align="center" style="padding:30px;">
                        <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet  Logo"
                />
                        <p style="margin:5px 0 0; font-size:14px;">
                            IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit
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
                      <td style="padding:40px 30px; color:#333;">

                        <p style="font-size:16px;">
                          Dear ${data.firstName || 'Valued Customer'},
                        </p>

                        <p style="font-size:16px;">
                          Thank you for your enquiry about eITS IndiaMet 2027- India's Dedicated Industrial Metrology Exhibition And Summit at 
                          
                        </p>

                        <p style="font-size:16px;">
                          We have received your request as follows:
                        </p>

                        <!-- INFO BOX -->
                        <table width="100%" cellpadding="10" cellspacing="0" 
                          style="background:#D7EEFB; margin:20px 0; border-collapse:collapse;">
                          
                            <tr>
                            <td width="40%"><strong>Company Name</strong></td>
                            <td>: ${data.companyName || data.company || 'Not provided'}</td>
                             </tr>

                            <tr>
                            <td><strong>Contact Person</strong></td>
                            <td>: ${data.firstName || ''} ${data.lastName || ''}</td>
                             </tr>

                            <tr>
                            <td><strong>Job Title</strong></td>
                            <td>: ${data.jobTitle || 'Not provided'}</td>
                             </tr>

                            <tr>
                            <td><strong>Address</strong></td>
                            <td>: ${data.address || 'Not provided'}</td>
                             </tr>

                            <tr>
                            <td><strong>Phone Number</strong></td>
                            <td>: ${data.phone || 'Not provided'}</td>
                             </tr>

                            <tr>
                            <td><strong>Email</strong></td>
                            <td>: ${data.email || 'Not provided'}</td>
                             </tr>

                            <tr>
                            <td><strong>Space Requirement</strong></td>
                            <td>: ${data.standSize || 'Not specified'}</td>
                             </tr>

                           </table>

                        <p style="font-size:15px;">
                          Our team will get in touch with you shortly to discuss your requirements 
                          and provide more information.
                        </p>

                        <p style="font-size:15px;">
                          We look forward to the opportunity to collaborate with you at 
                          <strong>IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit</strong>
                        </p>

                        <p style="margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit</strong>
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
                  style="max-width:220px; display:block; margin:0 auto;"
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
        subject = "Delegate Registration Confirmed - IndiaMet 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- TOP COLOR BACKGROUND -->
                <tr>
                <td align="center" style="background:#D7EEFB; padding:40px 0 0;">

                  <!-- BLUE HEADER (INSIDE COLOR AREA) -->
                  <table width="600" cellpadding="0" cellspacing="0" border="0"
                    style="background:#003A77; border-radius:6px 6px 0 0; color:#fff;">
                    
                      <tr>
                      <td align="center" style="padding:30px;">
                       <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="IndiaMet 2027 Logo"
                />
                        <p style="margin:5px 0 0; font-size:14px; color:#ffffff;">
                          IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit 
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
                      <td style="padding:40px 30px; text-align:center; color:#333;">

                        <h2 style="margin-bottom:10px;">Delegate Registration Confirmed !</h2>
                        <hr style="border:none; border-top:1px solid #ddd; width:80%; margin:10px auto 20px;" />

                        <p style="text-align:left;">
                          Dear ${data.firstName || data.name || data.contactPerson || 'Valued Delegate'},
                        </p>

                        <p style="text-align:left;">
                          Thank you for registering to attend 
                          <strong>IndiaMet 2027 Conference</strong>.<br/>
                          Below are your registration details and delegate badge.
                        </p>

                        <div style="margin:30px 0; text-align:center;">
                          <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                            <img src="cid:qrcode_${visitorCode}" alt="Delegate QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                            <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMet 2027 Delegate Pass</p>
                            <p style="margin:5px 0; font-size:12px; color:#666;">${[data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || ''}</p>
                            <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                            <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the delegate details.</p>
                          </div>
                        </div>

                        <!-- BUTTON - Download link -->
                        <div style="margin:30px 0;">
                          <a href="${badgeDownloadUrl}"
                             style="
                               background:#003A77;
                               color:#ffffff;
                               padding:15px 35px;
                               text-decoration:none;
                               border-radius:30px;
                               font-size:16px;
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

                        <div style="margin-top:15px; font-size:16px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px;">
                          Delegate Code: ${visitorCode}
                        </div>

                        <p style="margin-top:25px;">We look forward to seeing you at the event.</p>

                        <p style="font-size:13px; color:#666;">
                          If you have any questions, feel free to contact us.
                        </p>

                        <p style="text-align:left; margin-top:20px;">
                          Best regards,<br/>
                          <strong>IndiaMet 2027 Team</strong>
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
                  style="max-width:220px; display:block; margin:0 auto;"
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

      case "partner-registration":
        subject = "Your Partner Registration Confirmation - IndiaMet 2027";
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #9333EA 0%, #A855F7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .field { margin-bottom: 15px; }
              .field-label { font-weight: bold; color: #9333EA; }
              .field-value { margin-left: 10px; }
              hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Partner Registration Confirmed! 🤝</h1>
              </div>
              <div class="content">
                <h2>Welcome to IndiaMet 2027 - India's Dedicated Industrial Metrology Exhibition And Summit  , ${data.firstName || ''}!</h2>
                <p>Your partner registration has been successfully completed. Here's a summary of your registration details:</p>
                
                <hr/>
                
                <div class="field">
                  <span class="field-label">Name:</span>
                  <span class="field-value">${data.firstName || ''} ${data.lastName || ''}</span>
                </div>
                
                <div class="field">
                  <span class="field-label">Job Title:</span>
                  <span class="field-value">${data.jobTitle || 'Not provided'}</span>
                </div>
                
                <div class="field">
                  <span class="field-label">Email:</span>
                  <span class="field-value">${data.email || 'Not provided'}</span>
                </div>
                
                <div class="field">
                  <span class="field-label">Phone:</span>
                  <span class="field-value">+91 ${data.phone || 'Not provided'}</span>
                </div>
                
                <div class="field">
                  <span class="field-label">Company:</span>
                  <span class="field-value">${data.companyName || 'Not provided'}</span>
                </div>
                
                ${data.gstin ? `
                <div class="field">
                  <span class="field-label">GSTIN:</span>
                  <span class="field-value">${data.gstin}</span>
                </div>
                ` : ''}
                
                <div class="field">
                  <span class="field-label">Address:</span>
                  <span class="field-value">${data.address || 'Not provided'}</span>
                </div>
                
                ${data.website ? `
                <div class="field">
                  <span class="field-label">Website:</span>
                  <span class="field-value"><a href="${data.website}" style="color: #9333EA;">${data.website}</a></span>
                </div>
                ` : ''}
                
                <div class="field">
                  <span class="field-label">Marketing Consent:</span>
                  <span class="field-value">${data.marketingConsent ? '✅ Yes' : '❌ No'}</span>
                </div>
                
                <hr/>
                
                <p><strong>What's Next?</strong></p>
                <ul style="color: #666; margin-bottom: 20px;">
                  <li>Our partnership team will review your application within 2-3 business days</li>
                  <li>You'll receive an email with partnership benefits and next steps</li>
                  <li>A dedicated account manager will be assigned to assist you</li>
                  <li>We'll schedule an introductory call to discuss collaboration opportunities</li>
                </ul>
                
                <div style="background-color: #F3E8FF; border-left: 4px solid #9333EA; padding: 20px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #6B21A8;">
                    <strong>🤝 Partner Benefits:</strong><br>
                    • Exclusive networking opportunities<br>
                    • Priority booth allocation<br>
                    • Marketing and brand visibility<br>
                    • Access to partner events<br>
                    • Business matching services
                  </p>
                </div>
                
                <p>We're excited about the possibility of partnering with you!</p>
                
                <p>Best regards,<br/>
                <img 
                  src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                  style="max-width:220px; display:block; margin:0 auto;"
                  alt="Maxx Business Media Logo"
                /></p>
              </div>
            </div>
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