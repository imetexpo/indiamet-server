const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const modelFactory = require('../models');
const passService = require('../services/PassService');
const { authenticate, authorize } = require('../middleware/auth');

const scannerAccess = [authenticate, authorize(['admin', 'editor'])];
const router = express.Router();

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
  <text x="225" y="676" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#64748B">12–14 May 2027 · Auto Cluster Exhibition Center, Pune</text>
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
  <text x="225" y="644" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">IndiaMET 2027 · 12–14 May 2027</text>
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

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  if (!res.headersSent) {
    res.status(400).json({
      success: false,
      error: errors.array()[0]?.msg || 'Invalid request',
      errors: errors.array(),
    });
  }
  return true;
}

function handleError(res, error) {
  if (res.headersSent) return;
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    error: error.message || 'Something went wrong',
    ...(error.resendIn ? { resendIn: error.resendIn } : {}),
  });
}

// Badge Design Settings
router.get('/badge-design', ...scannerAccess, (req, res) => {
  const current = readBadgeConfig();
  res.json({
    success: true,
    design: current.design,
    designs: DESIGNS,
    updatedAt: current.updatedAt,
  });
});

router.put('/badge-design', authenticate, authorize(['admin']), (req, res) => {
  const { design } = req.body || {};
  if (design !== 'design1' && design !== 'design2') {
    return res.status(400).json({
      success: false,
      error: 'Invalid badge design. Choose design1 or design2.',
    });
  }
  const saved = writeBadgeConfig(design);
  res.json({
    success: true,
    design: saved.design,
    designs: DESIGNS,
    updatedAt: saved.updatedAt,
  });
});

router.get('/badge-designs/:design/preview', ...scannerAccess, async (req, res) => {
  const { design } = req.params;
  if (design !== 'design1' && design !== 'design2') {
    return res.status(404).json({ success: false, error: 'Badge design not found.' });
  }
  try {
    const svg = await renderSampleSvg(design);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate badge preview.' });
  }
});

// Visitor Pass Registration & OTP Routes
router.post(
  '/send-otp',
  [
    body('countryCode').notEmpty().withMessage('Country code is required'),
    body('mobile').notEmpty().withMessage('Mobile number is required'),
    body('channel').isIn(['sms', 'whatsapp', 'email']).withMessage('Choose SMS, WhatsApp, or Email'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await passService.sendOtp({
        countryCode: req.body.countryCode,
        nationalNumber: req.body.mobile,
        channel: req.body.channel,
        email: req.body.email,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.post(
  '/resend-otp',
  [
    body('countryCode').notEmpty().withMessage('Country code is required'),
    body('mobile').notEmpty().withMessage('Mobile number is required'),
    body('channel').isIn(['sms', 'whatsapp', 'email']).withMessage('Choose SMS, WhatsApp, or Email'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await passService.sendOtp({
        countryCode: req.body.countryCode,
        nationalNumber: req.body.mobile,
        channel: req.body.channel,
        email: req.body.email,
      });
      const labels = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };
      res.json({ ...result, message: `New OTP sent via ${labels[req.body.channel] || 'SMS'}` });
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.post(
  '/verify-otp',
  [
    body('countryCode').notEmpty().withMessage('Country code is required'),
    body('mobile').notEmpty().withMessage('Mobile number is required'),
    body('otp').isLength({ min: 4, max: 10 }).withMessage('Enter the verification code').isNumeric(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await passService.verifyOtp({
        countryCode: req.body.countryCode,
        nationalNumber: req.body.mobile,
        otp: req.body.otp,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.post(
  '/register',
  [
    body('verificationToken').notEmpty().withMessage('Verification token is required'),
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('company').trim().notEmpty().withMessage('Company name is required'),
    body('interests').isArray({ min: 1 }).withMessage('Select at least one interest'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { verificationToken, ...payload } = req.body;
      const result = await passService.completeRegistration({ verificationToken, payload });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.post('/resend-pass', async (req, res) => {
  try {
    const result = await passService.resendPass({
      verificationToken: req.body.verificationToken,
      publicCode: req.body.publicCode,
      channel: req.body.channel,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/admin/registrations', ...scannerAccess, async (req, res) => {
  try {
    const VisitorPass = modelFactory.getModel('VisitorPass');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    const conditions = [
      { [Op.or]: [{ source: null }, { source: { [Op.ne]: 'contact:delegate-registration' } }] },
    ];
    if (status && status !== 'all') {
      conditions.push({ status });
    }
    if (search) {
      conditions.push({
        [Op.or]: ['name', 'company', 'email', 'phone', 'registrationNumber'].map((field) => ({
          [field]: { [Op.like]: `%${search}%` },
        })),
      });
    }

    const { rows, count } = await VisitorPass.findAndCountAll({
      where: { [Op.and]: conditions },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    const activeDesign = readBadgeConfig().design || 'design1';
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const backend = (process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5000')
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    const registrations = rows.map((row) => {
      const plain = row.toJSON();
      return {
        ...plain,
        interests: Array.isArray(row.interests) ? row.interests : [],
        passUrl: `${frontend}/passes/view/${encodeURIComponent(row.publicCode)}`,
        badgeUrl: `${backend}/api/passes/${encodeURIComponent(row.publicCode)}/badge?design=${activeDesign}`,
        badgeDesign: activeDesign,
        cmsSync: {
          status: 'not_queued',
          leadId: null,
          syncedAt: null,
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
        },
      };
    });

    res.json({
      success: true,
      registrations,
      total: count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      cmsConfigured: false,
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/scanner/summary', ...scannerAccess, async (req, res) => {
  try {
    const result = await passService.scannerSummary();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.post(
  '/scan',
  ...scannerAccess,
  [body('code').notEmpty().withMessage('Pass code is required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await passService.recordScan({
        code: req.body.code,
        scannerId: req.body.scannerId,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.post(
  '/check-in',
  ...scannerAccess,
  [body('code').notEmpty().withMessage('Pass code is required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await passService.checkIn(req.body.code);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.get('/:code/badge', async (req, res) => {
  try {
    const code = req.params.code;
    const pass = await passService.getPassByCode(code);
    if (!pass) {
      return res.status(404).json({ success: false, error: 'Visitor pass not found' });
    }
    const requested = req.query.design;
    const design =
      requested === 'design2'
        ? 'design2'
        : requested === 'design1'
        ? 'design1'
        : readBadgeConfig().design || 'design1';
    const svg = await renderVisitorBadgeSvg({ visitor: pass, designId: design, isSample: false });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="indiamet-2027-badge-${pass.registrationNumber || code}.svg"`
      );
    }
    res.send(svg);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:code', [param('code').notEmpty()], async (req, res) => {
  try {
    const pass = await passService.getPassByCode(req.params.code);
    res.json({ success: true, pass });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
