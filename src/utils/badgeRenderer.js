const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const cloudinaryService = require('../services/CloudinaryService');

const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'badge-design.json');

const DESIGNS = [
  {
    id: 'design1',
    name: 'Design 1',
    description: 'Classic IndiaMET vertical visitor badge with navy header, centered visitor avatar, and high-contrast QR check-in block.',
  },
  {
    id: 'design2',
    name: 'Design 2',
    description: 'Modern teal-accented IndiaMET badge with split header banner, prominent company & designation layout, and bordered QR pass.',
  },
];

function readBadgeConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (parsed && (parsed.design === 'design1' || parsed.design === 'design2')) {
        return {
          design: parsed.design,
          updatedAt: parsed.updatedAt || null,
        };
      }
    }
  } catch (err) {
    console.warn('Could not read badge-design.json:', err.message);
  }
  return { design: 'design1', updatedAt: null };
}

function writeBadgeConfig(design) {
  const updatedAt = new Date().toISOString();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ design, updatedAt }, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write badge-design.json:', err.message);
  }
  return { design, updatedAt };
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function renderVisitorBadgeSvg({ visitor, designId, isSample = false }) {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const qrTarget = visitor?.publicCode
    ? `${frontend}/passes/view/${encodeURIComponent(visitor.publicCode)}`
    : 'https://indiametexpo.com/passes/badge/SAMPLE-IM2027-001';

  const qrSvg = await QRCode.toString(qrTarget, {
    type: 'svg',
    margin: 1,
    width: 170,
    color: { dark: '#003A77', light: '#FFFFFF' },
  });
  const innerQr = qrSvg
    .replace(/^<\?xml[^>]*\?>\s*/i, '')
    .replace(/^<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');

  const name = escapeXml(visitor?.name || 'Visitor');
  const initial = escapeXml((visitor?.name || 'V').trim().charAt(0).toUpperCase());
  const designation = escapeXml(visitor?.designation || '');
  const company = escapeXml(visitor?.company || '');
  const location = escapeXml(
    [visitor?.city, visitor?.state].filter(Boolean).join(', ') || visitor?.location || ''
  );
  const regNo = escapeXml(visitor?.registrationNumber || 'REG-IM-12052027-00042');
  const sampleNote = isSample ? 'SAMPLE PREVIEW — NOT VALID FOR ENTRY' : 'OFFICIAL VISITOR PASS';
  const subtitle = isSample ? 'VISITOR BADGE · SAMPLE' : 'VISITOR PASS';

  if (designId === 'design2') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="450" height="714" viewBox="0 0 450 714">
  <rect width="450" height="714" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
  <rect x="0" y="0" width="450" height="124" rx="16" fill="#003A77"/>
  <rect x="0" y="108" width="450" height="16" fill="#00A1B1"/>
  <text x="225" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" letter-spacing="3">INDIAMET 2027</text>
  <text x="225" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#8CE8F0" letter-spacing="4">${subtitle}</text>
  <circle cx="225" cy="186" r="40" fill="#00A1B1"/>
  <text x="225" y="198" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF">${initial}</text>
  <text x="225" y="258" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${name}</text>
  ${designation ? `<text x="225" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#00A1B1">${designation}</text>` : ''}
  ${company ? `<text x="225" y="${designation ? 310 : 290}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#475569">${company}</text>` : ''}
  ${location ? `<text x="225" y="${designation ? 332 : 312}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748B">${location}</text>` : ''}
  <rect x="120" y="360" width="210" height="210" rx="12" fill="#F8FAFC" stroke="#00A1B1" stroke-width="2"/>
  <g transform="translate(140, 380)">
    <svg width="170" height="170" viewBox="0 0 170 170">${innerQr}</svg>
  </g>
  <text x="225" y="596" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#003A77">${regNo}</text>
  <rect x="135" y="616" width="180" height="32" rx="16" fill="#003A77"/>
  <text x="225" y="637" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" letter-spacing="3">VISITOR</text>
  <text x="225" y="676" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#64748B">13–15 May 2027 · Auto Cluster Exhibition Center, Pune</text>
  <text x="225" y="695" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#94A3B8">${sampleNote}</text>
</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="450" height="714" viewBox="0 0 450 714">
  <rect width="450" height="714" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
  <rect x="0" y="0" width="450" height="92" rx="12" fill="#003A77"/>
  <rect x="0" y="80" width="450" height="12" fill="#003A77"/>
  <text x="225" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF" letter-spacing="2">INDIAMET 2027</text>
  <text x="225" y="68" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#00A1B1" letter-spacing="3">${subtitle}</text>
  <rect x="189" y="118" width="72" height="72" rx="8" fill="#00A1B1"/>
  <text x="225" y="166" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#FFFFFF">${initial}</text>
  <text x="225" y="226" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#003A77">${name}</text>
  ${company ? `<text x="225" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#475569">${company}</text>` : ''}
  ${location ? `<text x="225" y="274" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748B">${location}</text>` : ''}
  <rect x="125" y="302" width="200" height="200" rx="8" fill="#FCF8F3" stroke="#E2E8F0" stroke-width="1.5"/>
  <g transform="translate(140, 317)">
    <svg width="170" height="170" viewBox="0 0 170 170">${innerQr}</svg>
  </g>
  <text x="225" y="528" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">Scan at entry for instant check-in</text>
  <text x="225" y="554" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#00A1B1">${regNo}</text>
  <rect x="165" y="576" width="120" height="28" rx="4" fill="#E6F7F8"/>
  <text x="225" y="595" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#00A1B1" letter-spacing="2">VISITOR</text>
  <text x="225" y="644" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">IndiaMET 2027 · 13–15 May 2027</text>
  <text x="225" y="664" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#64748B">Auto Cluster Exhibition Center, Pune</text>
  <text x="225" y="694" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#94A3B8">${sampleNote}</text>
</svg>`;
}

async function renderSampleSvg(designId) {
  return renderVisitorBadgeSvg({
    visitor: {
      name: 'Aarav Sharma',
      designation: 'Head of Quality & Metrology',
      company: 'Apex Precision Engineering Pvt. Ltd.',
      city: 'Pune',
      state: 'Maharashtra',
      registrationNumber: 'REG-IM-12052027-00042',
      publicCode: 'SAMPLE-IM2027-001',
    },
    designId,
    isSample: true,
  });
}

/**
 * Uploads the visitor's badge (in the admin-chosen design) as a high-res PNG to Cloudinary.
 * Returns the public HTTPS Cloudinary image URL for Twilio WhatsApp MediaUrl.
 */
async function uploadBadgeImageToCloudinary(pass, designId = null) {
  try {
    const activeDesign = designId || readBadgeConfig().design || 'design1';
    const svgContent = await renderVisitorBadgeSvg({
      visitor: pass,
      designId: activeDesign,
      isSample: false,
    });

    const publicId = `badge-${pass.registrationNumber || pass.publicCode}-${activeDesign}`;
    const uploadRes = await cloudinaryService.uploadFile(Buffer.from(svgContent, 'utf8'), {
      folder: 'visitor-passes',
      public_id: publicId,
      format: 'png',
      resource_type: 'image',
      overwrite: true,
    });

    const publicUrl = uploadRes?.secure_url || uploadRes?.url;
    if (publicUrl) {
      console.log('[BadgeRenderer] Uploaded visitor badge (' + activeDesign + ') to Cloudinary:', publicUrl);
      return publicUrl;
    }
  } catch (err) {
    console.warn('[BadgeRenderer] Could not upload badge PNG to Cloudinary:', err.message);
  }
  return null;
}

module.exports = {
  DESIGNS,
  readBadgeConfig,
  writeBadgeConfig,
  escapeXml,
  renderVisitorBadgeSvg,
  renderSampleSvg,
  uploadBadgeImageToCloudinary,
};
