// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token missing' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Add clock tolerance to handle timezone issues
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: 60 // 60 seconds tolerance
    });

    const modelFactory = require('../models');
    const User = modelFactory.getModel('User');

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Admin users can have status 'active' only
    // If your admin user is created with different status, update it
    if (user.role === 'admin' && user.status !== 'active') {
      console.log(`⚠️ Admin user ${user.email} has status: ${user.status}, updating to active...`);
      await user.update({ status: 'active' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Account not active. Current status: ' + user.status });
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name
    };

    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({
      success: false,
      error: err.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid token'
    });
  }
};

const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    next();
  };
};

const authenticateExhibitor = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token missing' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: 60
    });

    if (decoded.role !== 'exhibitor') {
      return res.status(403).json({ success: false, error: 'Exhibitor access only' });
    }

    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(decoded.id);

    if (!exhibitor) {
      return res.status(401).json({ success: false, error: 'Exhibitor not found' });
    }

    if (!['active', 'approved'].includes(exhibitor.status)) {
      return res.status(403).json({ success: false, error: 'Account not active' });
    }

    req.user = {
      id: exhibitor.id,
      role: 'exhibitor',
      email: exhibitor.email,
      name: exhibitor.name,
      company: exhibitor.company,
      boothNumber: exhibitor.boothNumber || null,
      phone: exhibitor.phone
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid token'
    });
  }
};

const authenticateAny = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token missing' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: 60
    });

    const modelFactory = require('../models');

    if (decoded.role === 'exhibitor') {
      const Exhibitor = modelFactory.getModel('Exhibitor');
      const exhibitor = await Exhibitor.findByPk(decoded.id);
      if (!exhibitor) throw new Error();
      req.user = { ...exhibitor.dataValues, role: 'exhibitor' };
    } else {
      const User = modelFactory.getModel('User');
      const user = await User.findByPk(decoded.id);
      if (!user) throw new Error();
      req.user = { ...user.dataValues };
    }

    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

module.exports = {
  authenticate,
  authorize,
  authenticateExhibitor,
  authenticateAny
};