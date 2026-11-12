// src/routes/extraRequirementsRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

console.log('📦 extraRequirementsRoutes loaded (includes /admin/all, /admin/by-exhibitor, /admin/exhibitor/:id)');

// Helper function to extract items from requirement data
const extractRequirementItems = (data = {}) => {
  const items = [];

  // Extract furniture items
  if (data.furnitureItems && Array.isArray(data.furnitureItems)) {
    data.furnitureItems.forEach((item, index) => {
      const qty = Number(item.quantity) || 1;
      const cost = Number(item.cost) || 0;
      items.push({
        id: item.id || `furniture_${index}_${Date.now()}`,
        type: 'Furniture',
        quantity: qty,
        description: item.description || `Furniture: ${item.code || 'Item'}`,
        specifications: item.code ? `Code: ${item.code}, Cost: ₹${cost}` : '',
        unitPrice: cost,
        totalPrice: cost * qty,
      });
    });
  }

  // Extract AV & IT Rentals
  if (data.rentalItems && Array.isArray(data.rentalItems)) {
    data.rentalItems.forEach((item, index) => {
      const qty = Number(item.quantity) || 1;
      const unitCost = Number(item.costFor3Days) || 0;
      const totalCost = Number(item.totalCost) || unitCost * qty;
      items.push({
        id: item.id || `rental_${index}_${Date.now()}`,
        type: 'AV & IT Rentals',
        quantity: qty,
        description: item.description || `Rental: ${item.type || 'Equipment'}`,
        specifications: `Type: ${item.type || 'Rental'}, Cost: ₹${unitCost}`,
        unitPrice: unitCost,
        totalPrice: totalCost,
      });
    });
  }

  // Extract Electrical Load
  if (data.electricalLoad) {
    if (data.electricalLoad.exhibitionLoad && data.electricalLoad.exhibitionLoad !== '') {
      const exhTotal = Number(data.electricalLoad.exhibitionTotal) || 0;
      items.push({
        id: `electrical_exhibition_${Date.now()}`,
        type: 'Electrical Load',
        quantity: parseInt(data.electricalLoad.exhibitionLoad, 10) || 0,
        description: 'Exhibition Electrical Load',
        specifications: `Load: ${data.electricalLoad.exhibitionLoad} kW, Total: ₹${exhTotal}`,
        unitPrice: exhTotal,
        totalPrice: exhTotal,
      });
    }
    if (data.electricalLoad.temporaryLoad && data.electricalLoad.temporaryLoad !== '') {
      const tempTotal = Number(data.electricalLoad.temporaryTotal) || 0;
      items.push({
        id: `electrical_temporary_${Date.now()}`,
        type: 'Electrical Load',
        quantity: parseInt(data.electricalLoad.temporaryLoad, 10) || 0,
        description: 'Temporary Electrical Load',
        specifications: `Load: ${data.electricalLoad.temporaryLoad} kW, Total: ₹${tempTotal}`,
        unitPrice: tempTotal,
        totalPrice: tempTotal,
      });
    }
  }

  // Extract Hostess Requirements
  if (data.hostessRequirements && Array.isArray(data.hostessRequirements)) {
    data.hostessRequirements.forEach((item, index) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.ratePerDay) || 0;
      const amount = Number(item.amount) || rate * qty * (Number(item.noOfDays) || 1);
      items.push({
        id: `hostess_${index}_${Date.now()}`,
        type: 'Hostess Services',
        quantity: qty,
        description: `Hostess Category ${item.category || 'Standard'}`,
        specifications: `${item.noOfDays || 1} days at ₹${rate}/day`,
        unitPrice: rate,
        totalPrice: amount,
      });
    });
  }

  // Extract Compressed Air
  if (data.compressedAir && Number(data.compressedAir.qty) > 0) {
    const qty = Number(data.compressedAir.qty) || 1;
    const unit = Number(data.compressedAir.costPerConnection) || 0;
    const total = Number(data.compressedAir.totalCost) || unit * qty;
    items.push({
      id: `compressed_air_${Date.now()}`,
      type: 'Compressed Air',
      quantity: qty,
      description: 'Compressed Air Connection',
      specifications: `CFM: ${data.compressedAir.cfmRange || 'Standard'}, Power: ${data.compressedAir.powerKW || 0} kW`,
      unitPrice: unit,
      totalPrice: total,
    });
  }

  // Extract Water Connection
  if (data.waterConnection && Number(data.waterConnection.connections) > 0) {
    const qty = Number(data.waterConnection.connections) || 1;
    const unit = Number(data.waterConnection.costPerConnection) || 0;
    const total = Number(data.waterConnection.totalCost) || unit * qty;
    items.push({
      id: `water_${Date.now()}`,
      type: 'Water Connection',
      quantity: qty,
      description: 'Water Connection',
      specifications: `${qty} connections at ₹${unit}/each`,
      unitPrice: unit,
      totalPrice: total,
    });
  }

  // Extract Security Guard
  if (data.securityGuard && Number(data.securityGuard.quantity) > 0) {
    const qty = Number(data.securityGuard.quantity) || 1;
    const total = Number(data.securityGuard.totalCost) || 0;
    items.push({
      id: `security_${Date.now()}`,
      type: 'Security Guard',
      quantity: qty,
      description: 'Security Guard Service',
      specifications: `${data.securityGuard.noOfDays || 1} days`,
      unitPrice: qty > 0 ? total / qty : total,
      totalPrice: total,
    });
  }

  // Extract Housekeeping
  if (data.housekeepingStaff && Number(data.housekeepingStaff.quantity) > 0) {
    const qty = Number(data.housekeepingStaff.quantity) || 1;
    const shiftRate = Number(data.housekeepingStaff.chargesPerShift) || 0;
    const total = Number(data.housekeepingStaff.totalCost) || 0;
    items.push({
      id: `housekeeping_${Date.now()}`,
      type: 'Housekeeping',
      quantity: qty,
      description: 'Housekeeping Staff',
      specifications: `${data.housekeepingStaff.noOfDays || 1} days at ₹${shiftRate}/shift`,
      unitPrice: shiftRate,
      totalPrice: total,
    });
  }

  // Extract Security Deposit
  if (data.securityDeposit && Number(data.securityDeposit.amountINR) > 0) {
    const amount = Number(data.securityDeposit.amountINR) || 0;
    items.push({
      id: `deposit_${Date.now()}`,
      type: 'Security Deposit',
      quantity: 1,
      description: 'Security Deposit',
      specifications: `Booth Size: ${data.securityDeposit.boothSq || 'Standard'}`,
      unitPrice: amount,
      totalPrice: amount,
    });
  }

  // Fallback for direct array of items if present
  if (items.length === 0 && Array.isArray(data.items)) {
    data.items.forEach((item, index) => {
      items.push({
        id: item.id || `item_${index}_${Date.now()}`,
        type: item.type || 'General',
        quantity: Number(item.quantity) || 1,
        description: item.description || item.name || 'Requested Item',
        specifications: item.specifications || '',
        unitPrice: Number(item.unitPrice) || 0,
        totalPrice: Number(item.totalPrice) || 0,
      });
    });
  }

  return items;
};

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

async function loadRelatedFinance(sequelize) {
  let invoices = [];
  let orders = [];
  try {
    const [rows] = await sequelize.query('SELECT * FROM invoices');
    invoices = rows || [];
  } catch (error) {
    console.warn('Could not load invoices for extra requirements:', error.message);
  }
  try {
    const [rows] = await sequelize.query('SELECT * FROM cashfree_orders');
    orders = rows || [];
  } catch (error) {
    console.warn('Could not load cashfree orders for extra requirements:', error.message);
  }
  return { invoices, orders };
}

function findPaymentForRequirement(requirementId, exhibitorId, invoices, orders) {
  const matchingOrder = (orders || []).find(
    (order) => order.requirement_id === requirementId || order.requirementId === requirementId
  );

  let invoice = null;
  if (matchingOrder?.invoice_id) {
    invoice = (invoices || []).find((row) => row.id === matchingOrder.invoice_id);
  }

  if (!invoice) {
    invoice = (invoices || []).find((row) => {
      const metadata = parseMaybeJson(row.metadata);
      return metadata?.requirementsId === requirementId;
    });
  }

  if (!invoice) return null;

  const relatedOrders = (orders || []).filter((order) => order.invoice_id === invoice.id);
  const successfulOrder = relatedOrders.find((order) => {
    const status = String(order.order_status || '').toUpperCase();
    return status === 'PAID' || status === 'SUCCESS' || status === 'COMPLETED';
  });
  const invoiceStatus = String(invoice.status || '').toLowerCase();
  const metadata = parseMaybeJson(invoice.metadata);
  const isPaid = invoiceStatus === 'paid' || Boolean(successfulOrder);

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: roundMoney(invoice.amount || successfulOrder?.amount || matchingOrder?.amount || 0),
    status: isPaid ? 'paid' : invoiceStatus || 'pending',
    paymentMethod:
      successfulOrder || matchingOrder
        ? 'Online (Cashfree)'
        : metadata?.paymentInfo?.paymentMode || 'Invoice',
    paymentId: successfulOrder?.payment_id || relatedOrders[0]?.payment_id || null,
    orderId: successfulOrder?.order_id || relatedOrders[0]?.order_id || matchingOrder?.order_id || null,
    paidAt: invoice.paidDate || invoice.paid_at || null,
    dueDate: invoice.dueDate,
    issueDate: invoice.issueDate,
  };
}

async function getExhibitorRow(sequelize, exhibitorId) {
  if (!exhibitorId) return {};
  try {
    const [rows] = await sequelize.query(`SELECT * FROM exhibitors WHERE id = ? LIMIT 1`, {
      replacements: [exhibitorId],
    });
    return rows?.[0] || {};
  } catch (err) {
    console.warn('Could not load exhibitor row:', err.message);
    return {};
  }
}

function formatRequirementRecord(reqRecord, exhibitor = {}, finance = { invoices: [], orders: [] }) {
  const parsedData = parseMaybeJson(reqRecord.data);
  const generalInfo = parsedData.generalInfo || {};
  const boothDetails = parsedData.boothDetails || {};
  const stallDetails = parseMaybeJson(exhibitor.stallDetails);
  let items = extractRequirementItems(parsedData);

  if (items.length === 0 && reqRecord.description) {
    items = [
      {
        id: `${reqRecord.id}_summary`,
        type: reqRecord.type && reqRecord.type !== 'exhibitor' ? reqRecord.type : 'General',
        quantity: Number(reqRecord.quantity) || 1,
        description: reqRecord.description,
        specifications: '',
        unitPrice: Number(reqRecord.cost) || 0,
        totalPrice: Number(reqRecord.cost) || 0,
      },
    ];
  }

  const totals = parsedData.totals || {};
  const itemsTotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0));
  const payment = findPaymentForRequirement(
    reqRecord.id,
    reqRecord.exhibitorId,
    finance.invoices,
    finance.orders
  );

  const fullNameFromGeneral = `${generalInfo.firstName || ''} ${generalInfo.lastName || ''}`.trim();

  return {
    id: reqRecord.id,
    requirementId: reqRecord.id,
    exhibitorId: reqRecord.exhibitorId,
    stallNumber:
      boothDetails.boothNo ||
      exhibitor.boothNumber ||
      exhibitor.booth ||
      exhibitor.stallNumber ||
      '',
    companyName:
      generalInfo.companyName ||
      exhibitor.company ||
      exhibitor.companyName ||
      exhibitor.name ||
      'Unknown',
    contactPerson:
      boothDetails.contactPerson ||
      fullNameFromGeneral ||
      exhibitor.name ||
      exhibitor.contactPerson ||
      'Unknown',
    email: generalInfo.email || exhibitor.email || 'unknown@email.com',
    phone: generalInfo.mobile || exhibitor.phone || 'N/A',
    status: reqRecord.status || 'pending',
    submittedAt: reqRecord.createdAt || reqRecord.created_at,
    updatedAt: reqRecord.updatedAt || reqRecord.updated_at,
    notes: parsedData.notes || '',
    adminNotes: parsedData.adminNotes || '',
    items,
    totals: {
      servicesTotal: roundMoney(totals.servicesTotal || itemsTotal),
      gst: roundMoney(totals.gst || 0),
      deposit: roundMoney(totals.deposit || 0),
      total: roundMoney(totals.total || payment?.amount || itemsTotal),
    },
    payment,
    metadata: {
      boothArea: boothDetails.sqMtrBooked || stallDetails.size || '',
      boothLocation: boothDetails.boothNo || exhibitor.boothNumber || '',
      eventName: parsedData.eventName || 'IndiaMET 2027',
      eventDate: parsedData.eventDate,
      address: parsedData.companyDetails?.address || exhibitor.address || '',
      city: parsedData.companyDetails?.city || '',
      state: parsedData.companyDetails?.state || '',
      pincode: parsedData.companyDetails?.pincode || '',
    },
  };
}

// =============================================
// ADMIN ROUTES
// =============================================

// Get all extra requirements (admin)
router.get('/admin/all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 100, search, status } = req.query;

    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) {
      throw new Error('Database connection not available');
    }

    let whereClause = 'WHERE exhibitorId IS NOT NULL';
    const replacements = [];

    if (status && status !== 'all') {
      whereClause += ' AND status = ?';
      replacements.push(status);
    }

    if (search) {
      whereClause += ' AND (data LIKE ? OR id LIKE ? OR description LIKE ?)';
      replacements.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 100);
    const offset = (parsedPage - 1) * parsedLimit;

    const [requirements] = await sequelize.query(
      `
      SELECT * FROM requirements
      ${whereClause}
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `,
      {
        replacements: [...replacements, parsedLimit, offset],
      }
    );

    const [totalResult] = await sequelize.query(
      `
      SELECT COUNT(*) as total FROM requirements ${whereClause}
    `,
      {
        replacements,
      }
    );

    const total = totalResult[0]?.total || 0;
    const finance = await loadRelatedFinance(sequelize);
    const exhibitorCache = {};
    const groupedRequirements = {};

    for (const reqRecord of requirements || []) {
      const exhibitorId = reqRecord.exhibitorId || reqRecord.id;
      if (reqRecord.exhibitorId && !exhibitorCache[reqRecord.exhibitorId]) {
        exhibitorCache[reqRecord.exhibitorId] = await getExhibitorRow(sequelize, reqRecord.exhibitorId);
      }
      const exhibitor = exhibitorCache[reqRecord.exhibitorId] || {};
      const formatted = formatRequirementRecord(reqRecord, exhibitor, finance);

      if (!groupedRequirements[exhibitorId]) {
        groupedRequirements[exhibitorId] = {
          ...formatted,
          items: [...formatted.items],
        };
      } else {
        groupedRequirements[exhibitorId].items.push(...formatted.items);
        if (!groupedRequirements[exhibitorId].notes && formatted.notes) {
          groupedRequirements[exhibitorId].notes = formatted.notes;
        }
      }
    }

    const formattedRequirements = Object.values(groupedRequirements);

    res.json({
      success: true,
      data: formattedRequirements,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error('Error fetching extra requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get extra requirements grouped summary by exhibitor (for Exhibition -> Extra Requirements)
router.get('/admin/by-exhibitor', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) throw new Error('Database connection not available');

    const [requirements] = await sequelize.query(`
      SELECT * FROM requirements
      WHERE exhibitorId IS NOT NULL
      ORDER BY createdAt DESC
    `);

    const finance = await loadRelatedFinance(sequelize);
    const grouped = {};
    const exhibitorCache = {};

    for (const reqRecord of requirements || []) {
      if (reqRecord.exhibitorId && !exhibitorCache[reqRecord.exhibitorId]) {
        exhibitorCache[reqRecord.exhibitorId] = await getExhibitorRow(sequelize, reqRecord.exhibitorId);
      }
      const exhibitor = exhibitorCache[reqRecord.exhibitorId] || {};
      const formatted = formatRequirementRecord(reqRecord, exhibitor, finance);
      const key = reqRecord.exhibitorId || formatted.email;

      if (!grouped[key]) {
        grouped[key] = {
          exhibitorId: reqRecord.exhibitorId,
          companyName: formatted.companyName,
          contactPerson: formatted.contactPerson,
          email: formatted.email,
          phone: formatted.phone,
          stallNumber: formatted.stallNumber,
          requestCount: 0,
          paidCount: 0,
          pendingCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          latestSubmittedAt: formatted.submittedAt,
        };
      }

      const amount = formatted.payment?.amount || formatted.totals.total || 0;
      const isPaid = formatted.payment?.status === 'paid';
      grouped[key].requestCount += 1;
      grouped[key].totalAmount = roundMoney(grouped[key].totalAmount + amount);
      if (isPaid) {
        grouped[key].paidCount += 1;
        grouped[key].paidAmount = roundMoney(grouped[key].paidAmount + amount);
      } else {
        grouped[key].pendingCount += 1;
        grouped[key].pendingAmount = roundMoney(grouped[key].pendingAmount + amount);
      }
    }

    res.json({
      success: true,
      data: Object.values(grouped),
    });
  } catch (error) {
    console.error('Error fetching exhibitor extra requirements summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get extra requirements for a specific exhibitor
router.get('/admin/exhibitor/:exhibitorId', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { exhibitorId } = req.params;
    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) throw new Error('Database connection not available');

    const exhibitor = await getExhibitorRow(sequelize, exhibitorId);
    const finance = await loadRelatedFinance(sequelize);

    const [requirements] = await sequelize.query(
      `
      SELECT * FROM requirements
      WHERE exhibitorId = ?
      ORDER BY createdAt DESC
    `,
      {
        replacements: [exhibitorId],
      }
    );

    const requests = (requirements || []).map((reqRecord) =>
      formatRequirementRecord(reqRecord, exhibitor, finance)
    );

    const summary = requests.reduce(
      (acc, request) => {
        const amount = request.payment?.amount || request.totals.total || 0;
        acc.requestCount += 1;
        acc.itemCount += (request.items || []).length;
        acc.totalAmount = roundMoney(acc.totalAmount + amount);
        if (request.payment?.status === 'paid') {
          acc.paidCount += 1;
          acc.paidAmount = roundMoney(acc.paidAmount + amount);
        } else {
          acc.pendingCount += 1;
          acc.pendingAmount = roundMoney(acc.pendingAmount + amount);
        }
        return acc;
      },
      {
        requestCount: 0,
        itemCount: 0,
        paidCount: 0,
        pendingCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
      }
    );

    res.json({
      success: true,
      data: {
        exhibitor: {
          id: exhibitor.id || exhibitorId,
          name: exhibitor.name || requests[0]?.contactPerson || '',
          company: exhibitor.company || requests[0]?.companyName || '',
          email: exhibitor.email || requests[0]?.email || '',
          phone: exhibitor.phone || requests[0]?.phone || '',
          booth: exhibitor.booth || exhibitor.boothNumber || requests[0]?.stallNumber || '',
        },
        summary,
        requests,
      },
    });
  } catch (error) {
    console.error('Error fetching exhibitor extra requirements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get requirement stats (admin)
router.get('/admin/stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) {
      throw new Error('Database connection not available');
    }

    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(DISTINCT exhibitorId) as uniqueExhibitors
      FROM requirements
      WHERE exhibitorId IS NOT NULL
    `);

    res.json({
      success: true,
      data: stats[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
        uniqueExhibitors: 0,
      },
    });
  } catch (error) {
    console.error('Error fetching requirement stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get single requirement by ID (admin)
router.get('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) {
      throw new Error('Database connection not available');
    }

    const [requirements] = await sequelize.query(
      `
      SELECT * FROM requirements
      WHERE id = ?
    `,
      {
        replacements: [id],
      }
    );

    if (!requirements || requirements.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Requirement not found',
      });
    }

    const reqRecord = requirements[0];
    const exhibitor = await getExhibitorRow(sequelize, reqRecord.exhibitorId);
    const finance = await loadRelatedFinance(sequelize);
    const requirement = formatRequirementRecord(reqRecord, exhibitor, finance);

    res.json({
      success: true,
      data: requirement,
    });
  } catch (error) {
    console.error('Error fetching requirement details:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Update requirement status (admin)
router.put('/admin/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const sequelize = require('../config/database').getConnection('mysql');
    if (!sequelize) {
      throw new Error('Database connection not available');
    }

    const [existing] = await sequelize.query(
      `
      SELECT * FROM requirements WHERE id = ?
    `,
      {
        replacements: [id],
      }
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Requirement not found',
      });
    }

    const reqRecord = existing[0];
    const parsedData = parseMaybeJson(reqRecord.data);

    parsedData.adminNotes = adminNotes;
    parsedData.updatedBy = req.user?.id;
    parsedData.updatedAt = new Date().toISOString();

    await sequelize.query(
      `
      UPDATE requirements
      SET status = ?, data = ?, updatedAt = NOW()
      WHERE id = ?
    `,
      {
        replacements: [status || reqRecord.status, JSON.stringify(parsedData), id],
      }
    );

    const [updated] = await sequelize.query(
      `
      SELECT * FROM requirements WHERE id = ?
    `,
      {
        replacements: [id],
      }
    );

    const updatedReq = updated[0];
    const exhibitor = await getExhibitorRow(sequelize, updatedReq.exhibitorId);
    const finance = await loadRelatedFinance(sequelize);
    const requirement = formatRequirementRecord(updatedReq, exhibitor, finance);

    res.json({
      success: true,
      data: requirement,
      message: 'Requirement updated successfully',
    });
  } catch (error) {
    console.error('Error updating requirement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

module.exports = router;
