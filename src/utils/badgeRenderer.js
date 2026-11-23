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
    description: 'IndiaMET logo, visitor details, large centred QR, visitor ID and green visitor band matching the DIEMEX Design 2 layout.',
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

const LOGO_FILE = path.join(__dirname, '../assets/badge/indiamet-logo.png');
let cachedLogo;

function loadIndiaMetLogo() {
  if (!cachedLogo) {
    const bytes = fs.readFileSync(LOGO_FILE);
    cachedLogo = {
      dataUri: 'data:image/png;base64,' + bytes.toString('base64'),
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  return cachedLogo;
}

function wrapSvgLines(value, width, fontSize) {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.57)));
  const lines = [];
  let line = '';
  for (const word of value.split(' ')) {
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of Array.from(word)) {
      if (line.length >= maxChars) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function svgTextBlock(text, options) {
  const top = options.top;
  const height = options.height;
  const width = options.width === undefined ? 816 : options.width;
  const size = options.size === undefined ? 30 : options.size;
  const minSize = options.minSize === undefined ? 20 : options.minSize;
  const maxLines = options.maxLines === undefined ? 2 : options.maxLines;
  const weight = options.weight === undefined ? 500 : options.weight;
  const color = options.color === undefined ? '#000000' : options.color;
  const lineSpacing = options.lineSpacing === undefined ? 1.2 : options.lineSpacing;
  const value = cleanText(text).toUpperCase();
  if (!value) return '';
  let fontSize = size;
  let lines = [];
  for (; fontSize >= minSize; fontSize -= 1) {
    lines = wrapSvgLines(value, width, fontSize);
    if (lines.length <= maxLines && lines.length * fontSize * lineSpacing <= height) break;
  }
  fontSize = Math.max(fontSize, minSize);
  lines = wrapSvgLines(value, width, fontSize);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.57)));
    while (last.length >= maxChars) last = Array.from(last).slice(0, -1).join('');
    lines[maxLines - 1] = last + String.fromCharCode(8230);
  }
  const lineHeight = fontSize * lineSpacing;
  const firstY = top + height / 2 - (lines.length - 1) * lineHeight / 2;
  const tspans = lines.map((line, index) =>
    '<tspan x="450" y="' + (firstY + index * lineHeight) + '">' + escapeXml(line) + '</tspan>'
  ).join('');
  return '<text x="450" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="' +
    fontSize + '" font-weight="' + weight + '" fill="' + color + '">' + tspans + '</text>';
}

async function renderVisitorBadgeSvg({ visitor, designId, isSample = false }) {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const qrTarget = visitor?.publicCode
    ? frontend + '/passes/view/' + encodeURIComponent(visitor.publicCode)
    : 'https://indiametexpo.com/passes/badge/SAMPLE-IM2027-001';
  const isDesign2 = designId === 'design2';
  const qrSize = isDesign2 ? 414 : 170;
  const qrSvg = await QRCode.toString(qrTarget, {
    type: 'svg',
    margin: isDesign2 ? 4 : 1,
    width: qrSize,
    color: { dark: isDesign2 ? '#000000' : '#003A77', light: '#FFFFFF' },
  });
  const cleanQrSvg = qrSvg.replace(/^<\?xml[^>]*\?>\s*/i, '').trim();
  const positionQr = (x, y) =>
    cleanQrSvg.replace(/^<svg\b/i, '<svg x="' + x + '" y="' + y + '"');

  const name = escapeXml(visitor?.name || 'Visitor');
  const initial = escapeXml((visitor?.name || 'V').trim().charAt(0).toUpperCase());
  const company = escapeXml(visitor?.company || '');
  const location = escapeXml(
    [visitor?.city, visitor?.state].filter(Boolean).join(', ') || visitor?.location || ''
  );
  const country = visitor?.country || '';
  const regNo = escapeXml(visitor?.registrationNumber || 'REG-IM-12052027-00042');
  const sampleNote = isSample ? 'SAMPLE PREVIEW &#x2014; NOT VALID FOR ENTRY' : 'OFFICIAL VISITOR PASS';
  const subtitle = isSample ? 'VISITOR BADGE &#xB7; SAMPLE' : 'VISITOR PASS';

  if (isDesign2) {
    const logo = loadIndiaMetLogo();
    const logoWidth = 440;
    const logoHeight = logoWidth * logo.height / logo.width;
    const visitorId = 'IM-' + cleanText(visitor?.registrationNumber).replace(/\D/g, '').slice(-6);
    let detailsTop = 546;
    let designationSvg = '';
    if (cleanText(visitor?.designation)) {
      designationSvg = svgTextBlock(visitor.designation, {
        top: detailsTop, height: 44, width: 816, size: 34, minSize: 23, maxLines: 1, weight: 450,
      });
      detailsTop += 56;
    }
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1428" viewBox="0 0 900 1428">',
      '  <rect width="900" height="1428" fill="#FFFFFF"/>',
      '  <image href="' + logo.dataUri + '" x="' + ((900 - logoWidth) / 2) + '" y="76" width="' + logoWidth + '" height="' + logoHeight + '" preserveAspectRatio="xMidYMid meet"/>',
      '  <rect x="32" y="358" width="836" height="6" fill="#00A651"/>',
      '  ' + svgTextBlock(visitor?.name || 'Visitor', { top: 428, height: 100, width: 816, size: 58, minSize: 32, maxLines: 2, weight: 800 }),
      '  ' + designationSvg,
      '  ' + svgTextBlock(visitor?.company, { top: detailsTop, height: 62, width: 820, size: 35, minSize: 23, maxLines: 2, weight: 450 }),
      '  ' + (country ? svgTextBlock(country, { top: detailsTop + 72, height: 40, width: 816, size: 32, minSize: 23, maxLines: 1, weight: 450 }) : ''),
      '  ' + positionQr(243, 728),
      '  ' + svgTextBlock('Visitor ID: ' + visitorId, { top: 1148, height: 44, width: 820, size: 26, minSize: 17, maxLines: 1, weight: 450 }),
      '  <rect x="32" y="1236" width="836" height="128" fill="#00A651"/>',
      '  <text x="450" y="1300" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="3" fill="#000000">VISITOR</text>',
      '</svg>',
    ].join('\n');
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="714" viewBox="0 0 450 714">',
    '  <rect width="450" height="714" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>',
    '  <rect x="0" y="0" width="450" height="92" rx="12" fill="#003A77"/>',
    '  <rect x="0" y="80" width="450" height="12" fill="#003A77"/>',
    '  <text x="225" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF" letter-spacing="2">INDIAMET 2027</text>',
    '  <text x="225" y="68" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#00A1B1" letter-spacing="3">' + subtitle + '</text>',
    '  <rect x="189" y="118" width="72" height="72" rx="8" fill="#00A1B1"/>',
    '  <text x="225" y="166" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#FFFFFF">' + initial + '</text>',
    '  <text x="225" y="226" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#003A77">' + name + '</text>',
    '  ' + (company ? '<text x="225" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#475569">' + company + '</text>' : ''),
    '  ' + (location ? '<text x="225" y="274" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748B">' + location + '</text>' : ''),
    '  <rect x="125" y="302" width="200" height="200" rx="8" fill="#FCF8F3" stroke="#E2E8F0" stroke-width="1.5"/>',
    '  ' + positionQr(140, 317),
    '  <text x="225" y="528" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">Scan at entry for instant check-in</text>',
    '  <text x="225" y="554" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#00A1B1">' + regNo + '</text>',
    '  <rect x="165" y="576" width="120" height="28" rx="4" fill="#E6F7F8"/>',
    '  <text x="225" y="595" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#00A1B1" letter-spacing="2">VISITOR</text>',
    '  <text x="225" y="644" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">IndiaMET 2027 &#xB7; 13&#x2013;15 May 2027</text>',
    '  <text x="225" y="664" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#64748B">Auto Cluster Exhibition Center, Pune</text>',
    '  <text x="225" y="694" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#94A3B8">' + sampleNote + '</text>',
    '</svg>',
  ].join('\n');
}

async function renderSampleSvg(designId) {
  return renderVisitorBadgeSvg({
    visitor: {
      name: 'Aarav Sharma',
      designation: 'Head of Quality & Metrology',
      company: 'Apex Precision Engineering Pvt. Ltd.',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
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
