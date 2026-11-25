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

const {
  DESIGNS,
  readBadgeConfig,
  writeBadgeConfig,
  renderVisitorBadgeSvg,
  renderSampleSvg,
} = require('../utils/badgeRenderer');
const { renderSamplePng } = require('../utils/badgePngRenderer');

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
    if (design === 'design2') {
      const png = await renderSamplePng();
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.send(png);
      return;
    }
    const svg = await renderSampleSvg(design);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    console.error('[PassRoutes] Badge preview failed for ' + design + ':', err?.message || err);
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
    const VisitorPassCmsSync = modelFactory.getModel('VisitorPassCmsSync');
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
      include: [{ model: VisitorPassCmsSync, as: 'cmsSync', attributes: ['status', 'attempts', 'leadId', 'lastError', 'nextAttemptAt', 'syncedAt'], required: false }],
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
      const sync = plain.cmsSync || {};
      const isSynced = sync.status === 'synced' || Boolean(sync.syncedAt || sync.leadId || row.cmsSyncedAt || row.cmsLeadId);
      return {
        ...plain,
        interests: Array.isArray(row.interests) ? row.interests : [],
        passUrl: `${frontend}/passes/view/${encodeURIComponent(row.publicCode)}`,
        badgeUrl: `${backend}/api/passes/${encodeURIComponent(row.publicCode)}/badge?design=${activeDesign}`,
        badgeDesign: activeDesign,
        cmsSync: {
          status: sync.status || (isSynced ? 'synced' : (row.cmsStatus || 'not_queued')),
          leadId: sync.leadId || row.cmsLeadId || null,
          syncedAt: sync.syncedAt ? new Date(sync.syncedAt).toISOString() : (row.cmsSyncedAt ? row.cmsSyncedAt.toISOString() : null),
          attempts: sync.attempts ?? (isSynced ? 1 : (row.cmsStatus === 'error' ? 1 : 0)),
          lastError: sync.lastError || row.cmsError || null,
          nextAttemptAt: sync.nextAttemptAt ? new Date(sync.nextAttemptAt).toISOString() : null,
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
      cmsConfigured: require('../services/VisitorPassCmsSyncService').isConfigured(),
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
