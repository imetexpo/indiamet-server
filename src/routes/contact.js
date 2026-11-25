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

function formatEmailValue(value) {
  if (Array.isArray(value)) return value.map(formatEmailValue).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
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

function renderUserDetailsCard(formType, data = {}) {
  const isSponsor = formType === "sponsor-registration" || formType === "partner-registration";
  const labelColor = isSponsor ? "#6B21A8" : "#003A77";
  const borderColor = isSponsor ? "#E9D5FF" : "#CBD5E1";
  const bgColor = isSponsor ? "#FAF5FF" : "#E8F1F8";

  let fieldRows = [];

  switch (formType) {
    case "exhibitor-enquiry":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.companyWebsite || data.website || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["productsector", data.productSector || data.sector || data.industry || "N/A"],
        ["Interest Level", data.interestLevel || "N/A"],
        ["message", data.message || data.comments || "N/A"],
      ];
      break;

    case "event-brochure":
    // case "post-show-report": // commented for now
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["productsector", data.productSector || data.sector || data.industry || "N/A"],
      ];
      break;

    case "sponsor-registration":
    case "partner-registration":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Partnership Type", data.partnershipType ? (data.partnershipType.charAt(0).toUpperCase() + data.partnershipType.slice(1)) : (data.sponsorshipType || "N/A")],
      ];
      break;

    case "award-nomination":
    case "awards-registration":
    case "award-registration":
    case "nomination":
    case "awards":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || [data.city, data.state, data.country].filter(Boolean).join(", ") || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Award Category", data.awardCategory || data.category || "N/A"],
        ["industry", data.industry || "N/A"],
        ["message", data.message || data.achievements || "N/A"],
      ];
      break;

    case "visitor-registration":
      fieldRows = [
        ["Full Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.fullName || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["Media", data.media || data.mediaPartner || data.isMedia || data.industry || "N/A"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Visitorcode", data.visitorCode || "N/A"],
        ["promocode", data.promocode || data.promoCode || "N/A"],
      ];
      break;

    case "delegate-registration":
      fieldRows = [
        ["Full Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.fullName || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Visitorcode", data.visitorCode || "N/A"],
        ["promocode", data.promocode || data.promoCode || "N/A"],
        ["Select Package", data.package || "N/A"],
        ["Payment status", data.paymentStatus || "N/A"],
        ["Payment order ID", data.paymentOrderId || "N/A"],
      ];
      break;

    default:
      fieldRows = [
        ["Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Not provided"],
        ["Company", data.companyName || data.company || "Not provided"],
        ["Job Title", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["Phone Number", data.phone || data.mobile || "Not provided"],
        ["Address", data.address || "Not provided"],
      ];
  }

  const rowsHtml = fieldRows.map(([label, value], index) => {
    const isLast = index === fieldRows.length - 1;
    const borderStyle = isLast ? "" : `border-bottom:1px solid ${borderColor};`;
    return `
      <tr>
        <td width="38%" style="${borderStyle} color:${labelColor}; padding:8px 12px;"><strong>${label}</strong></td>
        <td style="${borderStyle} color:#1e293b; padding:8px 12px;">: ${value}</td>
      </tr>
    `;
  }).join("");

  return `
    <table width="100%" cellpadding="8" cellspacing="0" 
      style="background:${bgColor}; margin:20px 0; border:1px solid ${borderColor}; border-radius:6px; border-collapse:collapse; font-size:14px; text-align:left;">
      ${rowsHtml}
    </table>
  `;
}

function renderDetailsCard(data = {}, formType = "") {
  return renderUserDetailsCard(formType, data);
}

function renderSponsorDetailsCard(data = {}) {
  return renderUserDetailsCard("sponsor-registration", data);
}

function generateUserEmailTemplate({
  name,
  actionText,
  teamName,
  detailsCardHtml,
  extraContent = "",
  headerBg = "#F2F8FA",
  primaryColor = "#003A77",
  footerDateBg = "#003A77",
  footerDateColor = "#ffffff",
  footerOrgBg = "#E6EEF7"
}) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2; padding:25px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #E2E8F0;">
          
          <!-- LOGO HEADER (REDUCED COLOR, NO DARK BANNER) -->
          <tr>
            <td align="center" style="background:${headerBg}; padding:25px 24px; border-bottom:1px solid #E2E8F0;">
              <img 
                src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                style="max-width:180px; display:block; margin:0 auto;"
                alt="IndiaMET 2027 Logo"
              />
            </td>
          </tr>

          <!-- MAIN BODY OF THE CARD -->
          <tr>
            <td style="padding:30px; color:#333; font-family:Arial, sans-serif; text-align:left;">
              <p style="font-size:16px; margin:0 0 16px 0; color:#1e293b;">
                Dear ${name},
              </p>

              <p style="font-size:16px; line-height:1.6; margin:0 0 20px 0; color:#334155;">
                Thank you for your interest in ${actionText} <strong>IndiaMET 2027 – Dedicated Industrial Metrology Exhibition &amp; Summit</strong>. Below are your registration details:
              </p>

              ${detailsCardHtml}

              ${extraContent}

              <p style="font-size:14px; color:#555; margin:20px 0 0 0; line-height:1.5;">
                If you have any questions, feel free to contact us at <a href="mailto:pad@maxxmedia.in" style="color:${primaryColor}; text-decoration:none; font-weight:bold;">pad@maxxmedia.in</a>.
              </p>

              <p style="font-size:15px; margin:20px 0 0 0; line-height:1.5; color:#1e293b;">
                Best regards,<br/>
                <strong style="color:${primaryColor};">IndiaMET 2027 ${teamName}</strong>
              </p>
            </td>
          </tr>

          <!-- FOOTER: DATE & VENUE -->
          <tr>
            <td style="background:${footerDateBg}; color:${footerDateColor}; padding:15px; text-align:center; font-size:14px;">
              <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
            </td>
          </tr>

          <!-- FOOTER: ORGANIZER (LEFT LOGO, RIGHT END ADDRESS) -->
          <tr>
            <td style="background:${footerOrgBg}; padding:20px; font-size:12px; color:#333;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="38%" align="left" valign="middle">
                    <span style="font-size:11px; color:#666; font-weight:bold; text-transform:uppercase; display:block; margin-bottom:6px;">Organized By:</span>
                    <img 
                      src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                      style="max-width:140px; display:block;"
                      alt="Maxx Business Media Logo"
                    />
                  </td>
                  <td width="62%" align="right" valign="middle" style="font-size:12px; color:#333; line-height:1.6; text-align:right;">
                    <strong>Maxx Business Media Pvt Ltd</strong><br/>
                    T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                    Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
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
  `.trim();
}

function generateInwardTemplate({
  title,
  formType = "",
  data = {}
}) {
  const utmRows = [
    ["Submitted At", data.submittedAt || "N/A"],
    ["utmSource", data.utmSource || data.utm_source || "N/A"],
    ["utmMedium", data.utmMedium || data.utm_medium || "N/A"],
    ["utmCampaign", data.utmCampaign || data.utm_campaign || "N/A"],
    ["utmTerm", data.utmTerm || data.utm_term || "N/A"],
    ["utmContent", data.utmContent || data.utm_content || "N/A"],
    ["utmId", data.utmId || data.utm_id || "N/A"],
    ["referrer", data.referrer || "N/A"],
    ["landingPage", data.landingPage || "N/A"],
    ["utmTimestamp", data.utmTimestamp || "N/A"],
    ["cmsCampaignId", data.cmsCampaignId || "N/A"],
    ["cmsCampaignName", data.cmsCampaignName || "N/A"],
    ["cmsCampaignSource", data.cmsCampaignSource || "N/A"],
    ["cmsCampaignMedium", data.cmsCampaignMedium || "N/A"],
  ];

  let fieldRows = [];

  switch (formType) {
    case "exhibitor-enquiry":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.companyWebsite || data.website || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["productsector", data.productSector || (Array.isArray(data.productSectors) ? data.productSectors.join(", ") : data.productSectors) || data.sector || data.industry || "N/A"],
        ["Interest Level", data.interestLevel || "N/A"],
        ["message", data.message || data.comments || "N/A"],
        ...utmRows
      ];
      break;

    case "visitor-registration":
      fieldRows = [
        ["Full Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.fullName || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["Media", data.media || data.mediaPartner || data.isMedia || data.industry || "N/A"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Visitorcode", data.visitorCode || "N/A"],
        ["promocode", data.promocode || data.promoCode || "N/A"],
        ...utmRows
      ];
      break;

    case "event-brochure":
    // case "post-show-report": // commented for now
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["productsector", data.productSector || (Array.isArray(data.productSectors) ? data.productSectors.join(", ") : data.productSectors) || data.sector || data.industry || "N/A"],
        ...utmRows
      ];
      break;

    case "sponsor-registration":
    case "partner-registration":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["GSTIN", data.gstin || "N/A"],
        ["Product Sectors", Array.isArray(data.productSectors) ? data.productSectors.join(", ") : (data.productSectors || "N/A")],
        ["Marketing Consent", typeof data.marketingConsent === "boolean" ? (data.marketingConsent ? "Yes" : "No") : "N/A"],
        ["Privacy Consent", typeof data.privacyConsent === "boolean" ? (data.privacyConsent ? "Yes" : "No") : "N/A"],
        ["Partnership Type", data.partnershipType ? (data.partnershipType.charAt(0).toUpperCase() + data.partnershipType.slice(1)) : (data.sponsorshipType || "N/A")],
        ...utmRows
      ];
      break;

    case "delegate-registration":
      fieldRows = [
        ["Full Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.fullName || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["Email", data.email || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Visitorcode", data.visitorCode || "N/A"],
        ["promocode", data.promocode || data.promoCode || "N/A"],
        ["Select Package", data.package || "N/A"],
        ...utmRows
      ];
      break;

    case "award-nomination":
    case "awards-registration":
    case "award-registration":
    case "nomination":
    case "awards":
      fieldRows = [
        ["firstname", data.firstName || data.name?.split(" ")[0] || "Not provided"],
        ["lastname", data.lastName || (data.name?.includes(" ") ? data.name.split(" ").slice(1).join(" ") : "") || "Not provided"],
        ["companyname", data.companyName || data.company || "Not provided"],
        ["jobtittle", data.jobTitle || data.designation || "Not provided"],
        ["phone number", data.phone || data.mobile || "Not provided"],
        ["website", data.website || data.companyWebsite || "N/A"],
        ["address", data.address || [data.city, data.state, data.country].filter(Boolean).join(", ") || "Not provided"],
        ["country", data.country || "Not provided"],
        ["state", data.state || "Not provided"],
        ["city", data.city || "Not provided"],
        ["pin", data.pincode || data.pin || data.postalCode || "Not provided"],
        ["Award Category", data.awardCategory || data.category || "N/A"],
        ["industry", data.industry || "N/A"],
        ["message", data.message || data.achievements || "N/A"],
        ...utmRows
      ];
      break;

    default:
      fieldRows = [
        ["Name", [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Not provided"],
        ["Company", data.companyName || data.company || "Not provided"],
        ["Job Title", data.jobTitle || data.designation || "Not provided"],
        ["Phone Number", data.phone || data.mobile || "Not provided"],
        ["Address", data.address || "Not provided"],
        ...utmRows
      ];
  }

  fieldRows.unshift(["Email", data.email || "Not provided"]);
  fieldRows = fieldRows.map(([label, value]) => [
    escapeHtml(label),
    escapeHtml(formatEmailValue(value)),
  ]);

  const tableRowsHtml = fieldRows.map(([label, value]) => `
    <tr>
      <td width="38%" style="padding:7px 10px; border-bottom:1px solid #E2E8F0; color:#003A77; font-weight:bold;">${label}</td>
      <td style="padding:7px 10px; border-bottom:1px solid #E2E8F0; color:#1e293b;">: ${value}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f2f2f2; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2; padding:25px 0;">
    <tr>
      <td align="center">
        <!-- CARD -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #E2E8F0; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          
          <!-- 1. LOGO SECTION (bg-color - #F2F8FA) -->
          <tr>
            <td align="center" style="background:#F2F8FA; padding:25px 24px; border-bottom:1px solid #E2E8F0;">
              <img 
                src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png"
                style="max-width:180px; display:block; margin:0 auto;"
                alt="IndiaMET 2027 Logo"
              />
            </td>
          </tr>

          <!-- 2. REGISTRATION HEADER (bg color - #003A77, text-color - #ffffff) -->
          <tr>
            <td style="background:#003A77; color:#ffffff; text-align:center; padding:14px 20px; font-size:18px; font-weight:bold; letter-spacing:0.5px;">
              ${title}
            </td>
          </tr>

          <!-- 3. MAIN BODY OF CARD (SIMPLE TABLE FORM) -->
          <tr>
            <td style="padding:24px 30px; background:#ffffff;">
              <table width="100%" cellpadding="7" cellspacing="0" border="0" style="font-size:14px; color:#333; border-collapse:collapse; text-align:left;">
                ${tableRowsHtml}
              </table>
            </td>
          </tr>

          <!-- 4. FOOTER FIRST SECTION (DATE & VENUE: bg color - #003A77, text-color - #ffffff) -->
          <tr>
            <td style="background:#003A77; color:#ffffff; padding:15px; text-align:center; font-size:14px;">
              <strong>13-15 May 2027</strong> • Auto Cluster Exhibition Centre, Pune, India
            </td>
          </tr>

          <!-- 5. FOOTER SECOND SECTION (ORGANIZER: ON LEFT THE ORGANIZER LOGO, ON RIGHT END THE ADDRESS, bg-color - #E6EEF7) -->
          <tr>
            <td style="background:#E6EEF7; padding:20px; font-size:12px; color:#333;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="38%" align="left" valign="middle">
                    <span style="font-size:11px; color:#666; font-weight:bold; text-transform:uppercase; display:block; margin-bottom:6px;">Organized By:</span>
                    <img 
                      src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png"
                      style="max-width:140px; display:block;"
                      alt="Maxx Business Media Logo"
                    />
                  </td>
                  <td width="62%" align="right" valign="middle" style="font-size:12px; color:#333; line-height:1.6; text-align:right;">
                    <strong>Maxx Business Media Pvt Ltd</strong><br/>
                    T9, Swastik Manandi Arcade, Bengaluru, India<br/>
                    Tel: +91 91483 19993 | pad@maxxmedia.in | www.indiametexpo.com
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
  `.trim();
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

    
    if (formType === 'delegate-registration') {
      const packageKey = String(data.package || '').toLowerCase();
      const packageAmounts = { student: 3500, general: 6000, group: 15000 };
      const expectedAmount = packageAmounts[packageKey];
      const paymentOrderId = String(data.paymentOrderId || '');
      if (!expectedAmount || !paymentOrderId) {
        return res.status(402).json({ success: false, message: 'Complete payment for a valid delegate package before registering.' });
      }
      const sequelize = require('../config/database').getConnection('mysql');
      const [orders] = await sequelize.query(
        'SELECT order_id, invoice_id, amount, order_status FROM cashfree_orders WHERE order_id = ? LIMIT 1',
        { replacements: [paymentOrderId] },
      );
      const order = orders[0];
      if (!order ||
          String(order.order_status || '').toUpperCase() !== 'SUCCESS' ||
          order.invoice_id !== 'delegate-' + packageKey ||
          Math.abs(Number(order.amount) - expectedAmount) > 0.01) {
        return res.status(402).json({ success: false, message: 'Payment could not be verified for this delegate package.' });
      }
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

    const userName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || data.name || data.contactPerson || "Valued Customer";

    // Safely access data with fallbacks to prevent undefined errors
    switch (formType) {
      case "event-brochure":
        subject = "Your Event Brochure - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "downloading the event brochure for",
          teamName: "Brochure Team",
          detailsCardHtml: renderUserDetailsCard(formType, data),
          extraContent: `
            <div style="margin:25px 0; text-align:center;">
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
          `
        });
        break;

      /*
      case "post-show-report":
        subject = "Your Post Show Report - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "downloading the post show report for",
          teamName: "Post Show Report Team",
          detailsCardHtml: renderUserDetailsCard(formType, data),
          extraContent: `
            <div style="margin:25px 0; text-align:center;">
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
                Download Report
              </a>
              <p style="font-size:12px; color:#666; margin-top:10px;">
                Click the button above to download your copy.
              </p>
            </div>
          `
        });
        break;
      */

      case "visitor-registration":
        subject = "Visitor Registration Confirmed - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "visiting",
          teamName: "Visitor Registration Team",
          detailsCardHtml: renderUserDetailsCard(formType, data),
          extraContent: `
            <!-- QR CODE BADGE -->
            <div style="margin:25px 0; text-align:center;">
              <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1); border:1px solid #CBD5E1;">
                <img src="cid:qrcode_${visitorCode}" alt="Visitor QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMET 2027 Visitor Pass</p>
                <p style="margin:5px 0; font-size:12px; color:#666;">${userName}</p>
                <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the visitor details.</p>
              </div>
            </div>

            <!-- BUTTON - Download link -->
            <div style="margin:25px 0; text-align:center;">
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

            <div style="margin-top:15px; font-size:15px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px; color:#003A77; text-align:center;">
              Visitor Code: ${visitorCode}
            </div>
          `
        });
        break;

      case "exhibitor-enquiry":
        subject = "Your Exhibitor Enquiry - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "exhibiting at",
          teamName: "Exhibition Team",
          detailsCardHtml: renderUserDetailsCard(formType, data)
        });
        break;

      case "delegate-registration":
        subject = "Delegate Registration Confirmed - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "attending as a delegate at",
          teamName: "Delegate Registration Team",
          detailsCardHtml: renderUserDetailsCard(formType, data),
          extraContent: `
            <!-- QR CODE BADGE -->
            <div style="margin:25px 0; text-align:center;">
              <div style="background:#fff; padding:20px; border-radius:12px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.1); border:1px solid #CBD5E1;">
                <img src="cid:qrcode_${visitorCode}" alt="Delegate QR Code" width="200" height="200" style="width:200px; height:200px; display:block; margin:0 auto;" />
                <p style="margin-top:15px; font-size:14px; font-weight:bold; color:#003A77;">IndiaMET 2027 Delegate Pass</p>
                <p style="margin:5px 0; font-size:12px; color:#666;">${userName}</p>
                <p style="margin:5px 0; font-size:12px; color:#666; font-weight:bold;">Code: ${visitorCode}</p>
                <p style="margin:8px 0 0; font-size:12px; color:#003A77;">Scan this code to view the delegate details.</p>
              </div>
            </div>

            <!-- BUTTON - Download link -->
            <div style="margin:25px 0; text-align:center;">
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

            <div style="margin-top:15px; font-size:15px; font-weight:bold; padding:10px; background:#f5f5f5; border-radius:5px; color:#003A77; text-align:center;">
              Delegate Code: ${visitorCode}
            </div>
          `
        });
        break;

      case "sponsor-registration":
      case "partner-registration":
        subject = "Your Sponsorship & Partner Registration - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "sponsoring and partnering with",
          teamName: "Sponsorship & Partnerships Team",
          detailsCardHtml: renderUserDetailsCard(formType, data),
          headerBg: "#F5F3FF",
          primaryColor: "#6B21A8",
          footerOrgBg: "#F5F3FF"
        });
        break;

      case "award-nomination":
      case "awards-registration":
      case "award-registration":
      case "nomination":
      case "awards":
        subject = "Award Nomination Confirmed - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "submitting your nomination for",
          teamName: "Awards Team",
          detailsCardHtml: renderUserDetailsCard(formType, data)
        });
        break;

      default:
        subject = "Your Form Submission - IndiaMET 2027";
        html = generateUserEmailTemplate({
          name: userName,
          actionText: "submitting your enquiry to",
          teamName: "Team",
          detailsCardHtml: renderUserDetailsCard(formType, data)
        });
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

    let userEmailResult;

    // Prepare email options with attachments for QR code
    if ((formType === "visitor-registration" || formType === "delegate-registration") && qrCodeBuffer) {
      // Use the attachment method from EmailService
      userEmailResult = await emailService.sendEmailWithAttachment({
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
      userEmailResult = await emailService.sendEmail(data.email, subject, html);
    }
    const emailSent = userEmailResult?.success === true;
    if (emailSent) {
      console.log(`✅ User email sent successfully to ${data.email}`);
    } else {
      console.error("❌ User confirmation email failed:", userEmailResult?.error || "Unknown email error");
    }

    // Send notification to admin
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'pad@maxxmedia.in';
      console.log(`📧 Sending admin notification to ${adminEmail}`);

      // Generate admin email HTML using the same template - FIXED: Removed "None" from template
      let adminHtml = "";
      let adminSubject = "Exhibitor Enquiry - IndiaMet 2027";

      switch (formType) {
        case "delegate-registration":
          adminSubject = "Delegate Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Delegate Registration",
            formType,
            data: { ...data, visitorCode: visitorCode || 'N/A' }
          });
          break;

        case "exhibitor-enquiry":
          adminSubject = "Exhibitor Enquiry - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Exhibitor Registration",
            formType,
            data
          });
          break;

        case "event-brochure":
          adminSubject = "Brochure Download - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Brochure Download",
            formType,
            data
          });
          break;

        /*
        case "post-show-report":
          adminSubject = "Post Show Report - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Post Show Report Download",
            formType,
            data
          });
          break;
        */

        case "visitor-registration":
          adminSubject = "New Visitor Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Visitor Registration",
            formType,
            data: { ...data, visitorCode: visitorCode || 'N/A' }
          });
          break;

        case "sponsor-registration":
        case "partner-registration":
          adminSubject = "New Sponsor / Partner Registration - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Sponsor Registration",
            formType,
            data
          });
          break;

        case "award-nomination":
        case "awards-registration":
        case "award-registration":
        case "nomination":
        case "awards":
          adminSubject = "New Award Nomination - IndiaMET 2027";
          adminHtml = generateInwardTemplate({
            title: "Award Nomination",
            formType,
            data
          });
          break;

        default:
          adminSubject = "Form Submission - IndiaMet 2027";
          adminHtml = generateInwardTemplate({
            title: "Form Submission",
            formType,
            data
          });
      }

      const adminEmailResult = await emailService.sendEmail(
        adminEmail,
        adminSubject,
        adminHtml
      );
      if (!adminEmailResult?.success) {
        throw new Error(adminEmailResult?.error || "Admin notification could not be sent");
      }
      console.log(`✅ Admin notification sent to ${adminEmail}`);
    } catch (adminError) {
      console.error("❌ Admin notification failed:", adminError);
      // Don't fail the request if admin notification fails
    }

    if (submission) {
      await submission.update({ emailStatus: emailSent ? 'sent' : 'failed' }).catch(() => null);
    }

    if (!emailSent) {
      return res.status(502).json({
        success: false,
        emailSent: false,
        message: "Your details were received, but the confirmation email could not be sent. Please contact pad@maxxmedia.in for help.",
        visitorCode: visitorCode || null,
        ...(issued ? { pass: issued.pass, delivery: issued.delivery } : {})
      });
    }

    return res.status(200).json({
      success: true,
      emailSent: true,
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
    provider: "resend",
    environment: {
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasResendFrom: !!process.env.RESEND_FROM,
      emailServiceInitialized: emailService.initialized
    }
  });
});

module.exports = router;