// src/routes/exhibitorDashboard.js
const express = require('express');
const router = express.Router();
const { authenticateExhibitor } = require('../middleware/auth');
const cloudinaryService = require('../services/CloudinaryService');

const productRoutes = require('./exhibitorProducts');
const brandRoutes = require('./exhibitorBrands');
const brochureRoutes = require('./exhibitorBrochures');
const stallRoutes = require('./exhibitorStall');

const multer = require('multer');
const upload = multer();

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// All routes require exhibitor authentication
router.use(authenticateExhibitor);

router.use('/products', productRoutes);
router.use('/brands', brandRoutes);
router.use('/brochures', brochureRoutes);
router.use('/stall', stallRoutes);

// ==================== PROFILE ROUTES ====================

// GET /profile
router.get('/profile', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    const exhibitorData = exhibitor.toJSON();

    // Safely parse metadata
    let metadata = {};
    if (exhibitorData.metadata) {
      if (typeof exhibitorData.metadata === 'string') {
        try {
          metadata = JSON.parse(exhibitorData.metadata);
        } catch (err) {
          console.error('❌ JSON parse error for metadata:', err.message);
          metadata = {};
        }
      } else {
        metadata = exhibitorData.metadata;
      }
    }

    // Safely parse stallDetails
    let stallDetails = {};
    if (exhibitorData.stallDetails) {
      if (typeof exhibitorData.stallDetails === 'string') {
        try {
          stallDetails = JSON.parse(exhibitorData.stallDetails);
        } catch (err) {
          console.error('❌ JSON parse error for stallDetails:', err.message);
          stallDetails = {};
        }
      } else {
        stallDetails = exhibitorData.stallDetails;
      }
    }

    console.log('✅ Retrieved metadata from DB:', metadata);
    console.log('✅ Logo URL from metadata:', metadata.logoUrl);

    // Build address object - prioritize metadata over direct fields
    const addressObj = {
      street: metadata.address_street || metadata.street || exhibitorData.address || '',
      city: metadata.city || '',
      state: metadata.state || '',
      country: metadata.country || '',
      countryCode: metadata.countryCode || '',
      postalCode: metadata.pincode || metadata.postalCode || ''
    };

    // Build contact person
    const contactPerson = {
      name: metadata.contactPersonName || metadata.contact_name || exhibitorData.name || '',
      jobTitle: metadata.contactPersonJobTitle || metadata.contact_job_title || '',
      email: exhibitorData.email || metadata.email || '',
      phone: exhibitorData.phone || metadata.phone || '',
      alternatePhone: metadata.alternatePhone || metadata.alternate_phone || ''
    };

    // Build exhibition object
    const exhibition = {
      pavilion: metadata.pavilion || metadata.exhibition?.pavilion || '',
      hall: metadata.hall || metadata.exhibition?.hall || '',
      standNumber: exhibitorData.boothNumber || metadata.boothNumber || metadata.exhibition?.standNumber || '',
      floorPlanUrl: metadata.floor_plan_url || metadata.exhibition?.floorPlanUrl || ''
    };

    // Parse sector
    let sectorArray = [];
    if (exhibitorData.sector) {
      if (typeof exhibitorData.sector === 'string') {
        sectorArray = exhibitorData.sector.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(exhibitorData.sector)) {
        sectorArray = exhibitorData.sector;
      }
    } else if (metadata.sector) {
      if (typeof metadata.sector === 'string') {
        sectorArray = metadata.sector.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(metadata.sector)) {
        sectorArray = metadata.sector;
      }
    }

    // Build social media object
    const socialMedia = {
      website: exhibitorData.website || metadata.website || metadata.socialMedia?.website || '',
      linkedin: metadata.linkedin || metadata.socialMedia?.linkedin || '',
      twitter: metadata.twitter || metadata.socialMedia?.twitter || '',
      facebook: metadata.facebook || metadata.socialMedia?.facebook || '',
      instagram: metadata.instagram || metadata.socialMedia?.instagram || ''
    };

    // Prepare response data with ALL fields properly mapped
    const responseData = {
      id: exhibitorData.id,
      name: exhibitorData.name,
      email: exhibitorData.email,
      phone: exhibitorData.phone || '',
      company: exhibitorData.company,
      sector: sectorArray,
      boothNumber: exhibitorData.boothNumber || '',
      website: exhibitorData.website || '',
      address: addressObj.street, // Send street as string for backward compatibility
      description: metadata.about || exhibitorData.description || '',
      status: exhibitorData.status === 'approved' ? 'active' : (exhibitorData.status || 'pending'),
      createdAt: exhibitorData.createdAt,
      updatedAt: exhibitorData.updatedAt,

      // Include metadata and stallDetails
      metadata: metadata,
      stallDetails: stallDetails,

      // Logo URL - CRITICAL: Make sure this is included
      logoUrl: metadata.logoUrl || '',

      // Flattened company info
      shortName: metadata.shortName || metadata.short_name || '',
      registrationNumber: metadata.registrationNumber || metadata.registration_number || '',
      yearEstablished: metadata.yearEstablished || metadata.year_established || '',
      companySize: metadata.companySize || metadata.company_size || '',
      companyType: metadata.companyType || metadata.company_type || '',
      gstNumber: metadata.gstNumber || metadata.gst_number || '',
      businessNature: metadata.businessNature || metadata.business_nature || '',

      // Flattened contact person
      contactPersonName: contactPerson.name,
      contactPersonJobTitle: contactPerson.jobTitle,
      alternatePhone: contactPerson.alternatePhone,

      // Flattened address fields - CRITICAL for frontend display
      city: metadata.city || '',
      state: metadata.state || '',
      pincode: metadata.pincode || metadata.postalCode || '',
      country: metadata.country || '',

      // Contact person object (for compatibility)
      contactPerson: contactPerson,

      // Exhibition object
      exhibition: exhibition,

      // Address object (for compatibility)
      addressObj: addressObj,

      // Business details
      about: metadata.about || '',
      mission: metadata.mission || '',
      vision: metadata.vision || '',

      // Social media
      socialMedia: socialMedia,

      // Booth fields
      boothSize: stallDetails.size || metadata.boothSize || metadata.booth_size || '',
      boothType: stallDetails.type || metadata.boothType || metadata.booth_type || 'standard',
      boothDimensions: stallDetails.dimensions || metadata.boothDimensions || metadata.booth_dimensions || '',
      boothNotes: stallDetails.notes || metadata.boothNotes || metadata.booth_notes || '',
      boothStatus: metadata.boothStatus || metadata.booth_status || stallDetails.status || 'pending',
      boothPrice: stallDetails.price || metadata.boothPrice || metadata.booth_price || ''
    };

    console.log('✅ Sending response with logoUrl:', responseData.logoUrl);
    console.log('✅ Sending address fields - city:', responseData.city, 'state:', responseData.state, 'pincode:', responseData.pincode);

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ PROFILE ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update exhibitor profile
router.put('/profile', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');
    
    let exhibitor;
    if (process.env.DB_TYPE === 'mysql') {
      exhibitor = await Exhibitor.findByPk(req.user.id);
    } else {
      exhibitor = await Exhibitor.findById(req.user.id);
    }
    
    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }
    
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated by exhibitor
    delete updateData.id;
    delete updateData.email;
    delete updateData.status;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    // CRITICAL: Handle metadata properly - preserve existing metadata and merge
    let existingMetadata = {};
    if (exhibitor.metadata) {
      try {
        existingMetadata = typeof exhibitor.metadata === 'string' 
          ? JSON.parse(exhibitor.metadata) 
          : exhibitor.metadata;
      } catch (e) {
        console.error('Error parsing existing metadata:', e);
        existingMetadata = {};
      }
    }
    
    // Merge new metadata with existing metadata
    if (updateData.metadata) {
      // If metadata is a string, parse it
      let newMetadata = updateData.metadata;
      if (typeof newMetadata === 'string') {
        try {
          newMetadata = JSON.parse(newMetadata);
        } catch (e) {
          console.error('Error parsing new metadata:', e);
          newMetadata = {};
        }
      }
      
      // Merge (existing takes precedence for fields not in new, but new overwrites existing)
      const mergedMetadata = {
        ...existingMetadata,
        ...newMetadata
      };
      
      updateData.metadata = JSON.stringify(mergedMetadata);
      console.log('✅ Merged metadata:', mergedMetadata);
    } else if (existingMetadata && Object.keys(existingMetadata).length > 0) {
      // Keep existing metadata if not provided in update
      updateData.metadata = JSON.stringify(existingMetadata);
    }
    
    // Handle stallDetails properly - preserve existing and merge
    let existingStallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        existingStallDetails = typeof exhibitor.stallDetails === 'string' 
          ? JSON.parse(exhibitor.stallDetails) 
          : exhibitor.stallDetails;
      } catch (e) {
        console.error('Error parsing existing stallDetails:', e);
        existingStallDetails = {};
      }
    }
    
    if (updateData.stallDetails) {
      let newStallDetails = updateData.stallDetails;
      if (typeof newStallDetails === 'string') {
        try {
          newStallDetails = JSON.parse(newStallDetails);
        } catch (e) {
          console.error('Error parsing new stallDetails:', e);
          newStallDetails = {};
        }
      }
      
      const mergedStallDetails = {
        ...existingStallDetails,
        ...newStallDetails
      };
      
      updateData.stallDetails = JSON.stringify(mergedStallDetails);
      console.log('✅ Merged stallDetails:', mergedStallDetails);
    } else if (existingStallDetails && Object.keys(existingStallDetails).length > 0) {
      updateData.stallDetails = JSON.stringify(existingStallDetails);
    }
    
    // Handle password update if needed
    if (updateData.password) {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    
    // Update exhibitor
    await exhibitor.update(updateData);
    
    // Fetch the updated exhibitor to return
    const updatedExhibitor = await Exhibitor.findByPk(req.user.id);
    const responseData = updatedExhibitor.toJSON();
    
    // Parse metadata for response
    let responseMetadata = {};
    if (responseData.metadata) {
      try {
        responseMetadata = typeof responseData.metadata === 'string' 
          ? JSON.parse(responseData.metadata) 
          : responseData.metadata;
      } catch (e) {
        console.error('Error parsing response metadata:', e);
      }
    }
    
    // Parse stallDetails for response
    let responseStallDetails = {};
    if (responseData.stallDetails) {
      try {
        responseStallDetails = typeof responseData.stallDetails === 'string' 
          ? JSON.parse(responseData.stallDetails) 
          : responseData.stallDetails;
      } catch (e) {
        console.error('Error parsing response stallDetails:', e);
      }
    }
    
    // Build response with parsed data
    const formattedResponse = {
      id: responseData.id,
      name: responseData.name,
      email: responseData.email,
      company: responseData.company,
      phone: responseData.phone,
      boothNumber: responseData.boothNumber,
      sector: responseData.sector,
      website: responseData.website,
      address: responseData.address,
      status: responseData.status,
      createdAt: responseData.createdAt,
      updatedAt: responseData.updatedAt,
      metadata: responseMetadata,
      stallDetails: responseStallDetails,
      // Also include logoUrl at top level for easier access
      logoUrl: responseMetadata.logoUrl || responseData.logoUrl || ''
    };
    
    res.json({
      success: true,
      data: formattedResponse,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.post('/profile/logo/upload', authenticateExhibitor, uploadMemory.single('logo'), async (req, res) => {
  try {
    console.log('📤 Uploading logo file for exhibitor:', req.user.id);
    console.log('📦 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Upload to Cloudinary
    const result = await cloudinaryService.uploadFile(req.file.buffer, {
      folder: 'exhibitor-logos',
      resource_type: 'image',
      type: 'upload',
      access_mode: 'public'
    });

    console.log('✅ Cloudinary upload result:', {
      url: result.url,
      publicId: result.publicId
    });

    // Update exhibitor metadata with logo URL
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    let metadata = {};
    if (exhibitor.metadata) {
      try {
        metadata = typeof exhibitor.metadata === 'string'
          ? JSON.parse(exhibitor.metadata)
          : exhibitor.metadata;
        console.log('📦 Existing metadata:', metadata);
      } catch (e) {
        console.error('Error parsing metadata:', e);
        metadata = {};
      }
    }

    // Save logo URL
    metadata.logoUrl = result.url;
    metadata.logoPublicId = result.publicId;
    metadata.logoUpdatedAt = new Date().toISOString();

    // Update the exhibitor
    await exhibitor.update({
      metadata: JSON.stringify(metadata)
    });

    console.log('✅ Logo URL saved to metadata:', metadata.logoUrl);
    console.log('✅ Full metadata after update:', metadata);

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        logoUrl: result.url,
        publicId: result.publicId
      }
    });

  } catch (error) {
    console.error('❌ Logo upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/profile/logo', authenticateExhibitor, async (req, res) => {
  try {
    console.log('📤 Updating logo URL for exhibitor:', req.user.id);
    console.log('📦 Request body:', req.body);

    const { logoUrl, publicId } = req.body;

    if (!logoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Logo URL is required'
      });
    }

    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    let metadata = {};
    if (exhibitor.metadata) {
      try {
        metadata = typeof exhibitor.metadata === 'string'
          ? JSON.parse(exhibitor.metadata)
          : exhibitor.metadata;
      } catch (e) {
        metadata = {};
      }
    }

    metadata.logoUrl = logoUrl;
    if (publicId) metadata.logoPublicId = publicId;
    metadata.logoUpdatedAt = new Date().toISOString();

    await exhibitor.update({
      metadata: JSON.stringify(metadata)
    });

    console.log('✅ Logo URL saved:', logoUrl);

    res.json({
      success: true,
      message: 'Logo updated successfully',
      data: {
        logoUrl: logoUrl,
        publicId: publicId
      }
    });

  } catch (error) {
    console.error('❌ Logo update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get logo URL
router.get('/profile/logo', authenticateExhibitor, async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    let metadata = {};
    if (exhibitor.metadata) {
      try {
        metadata = typeof exhibitor.metadata === 'string'
          ? JSON.parse(exhibitor.metadata)
          : exhibitor.metadata;
      } catch (e) {
        metadata = {};
      }
    }

    res.json({
      success: true,
      data: {
        logoUrl: metadata.logoUrl || null,
        publicId: metadata.logoPublicId || null
      }
    });

  } catch (error) {
    console.error('❌ Get logo error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DASHBOARD ROUTES ====================

// Get exhibitor's complete dashboard data - FIXED VERSION
router.get('/layout', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard layout for exhibitor:', req.user.id);
    
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    // Get exhibitor
    let exhibitor;
    if (process.env.DB_TYPE === 'mysql') {
      exhibitor = await Exhibitor.findByPk(req.user.id);
    } else {
      exhibitor = await Exhibitor.findById(req.user.id);
    }

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Get floor plan safely - handle missing model
    let floorPlan = null;
    try {
      const FloorPlan = modelFactory.getModel('FloorPlan');
      if (FloorPlan) {
        if (process.env.DB_TYPE === 'mysql') {
          floorPlan = await FloorPlan.findOne({
            where: { isActive: true }
          });
        } else {
          floorPlan = await FloorPlan.findOne({ isActive: true });
        }
      }
    } catch (floorPlanError) {
      console.warn('⚠️ FloorPlan model not available:', floorPlanError.message);
    }

    // Parse stall details
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        stallDetails = typeof exhibitor.stallDetails === 'string' 
          ? JSON.parse(exhibitor.stallDetails) 
          : exhibitor.stallDetails;
      } catch (e) {
        console.warn('Failed to parse stallDetails:', e.message);
      }
    }

    // Get invoices safely - handle missing service
    let invoices = [];
    try {
      const invoiceService = require('../services/InvoiceService');
      if (invoiceService && typeof invoiceService.getInvoicesByExhibitor === 'function') {
        invoices = await invoiceService.getInvoicesByExhibitor(exhibitor.id);
      } else {
        console.warn('⚠️ InvoiceService not available, returning empty invoices');
      }
    } catch (invoiceError) {
      console.warn('⚠️ Failed to fetch invoices:', invoiceError.message);
    }

    // Get requirements
    let requirements = [];
    try {
      const Requirement = modelFactory.getModel('Requirement');
      if (Requirement) {
        if (process.env.DB_TYPE === 'mysql') {
          requirements = await Requirement.findAll({
            where: { exhibitorId: exhibitor.id },
            order: [['createdAt', 'DESC']],
            limit: 5
          });
        } else {
          requirements = await Requirement.find({ exhibitorId: exhibitor.id })
            .sort({ createdAt: -1 })
            .limit(5);
        }
      }
    } catch (reqError) {
      console.warn('⚠️ Failed to fetch requirements:', reqError.message);
    }

    // Prepare booth details
    let boothDetails = null;
    if (floorPlan && exhibitor.boothNumber) {
      const booths = floorPlan.booths || [];
      boothDetails = booths.find(booth => booth.boothNumber === exhibitor.boothNumber);
    }

    // Get event details from config or database
    let event = null;
    try {
      const Event = modelFactory.getModel('Event');
      if (Event) {
        if (process.env.DB_TYPE === 'mysql') {
          event = await Event.findOne({
            where: { isActive: true }
          });
        } else {
          event = await Event.findOne({ isActive: true });
        }
      }
    } catch (eventError) {
      console.warn('⚠️ Event model not available');
    }

    // Fallback event data if not found
    const eventData = event || {
      name: 'DIEMEX 2026',
      venue: 'Auto Cluster Exhibition Center',
      exhibitionDay: '8th October, 2026',
      dismantleDay: '10th October, 2026'
    };

    // Response
    res.json({
      success: true,
      data: {
        exhibitor: {
          id: exhibitor.id,
          name: exhibitor.name,
          company: exhibitor.company,
          email: exhibitor.email,
          phone: exhibitor.phone || '',
          boothNumber: exhibitor.boothNumber || '',
          stallDetails: stallDetails,
          sector: exhibitor.sector || '',
          website: exhibitor.website || '',
          address: exhibitor.address || '',
          description: exhibitor.description || '',
          status: exhibitor.status === 'approved' ? 'active' : (exhibitor.status || 'pending')
        },
        floorPlan: floorPlan ? {
          id: floorPlan.id,
          name: floorPlan.name,
          floor: floorPlan.floor,
          gridSize: floorPlan.gridSize
        } : null,
        booth: boothDetails || null,
        invoices: invoices.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: inv.status,
          dueDate: inv.dueDate
        })),
        requirements: requirements.map(req => ({
          id: req.id,
          type: req.type,
          description: req.description,
          status: req.status
        })),
        event: eventData
      }
    });

  } catch (error) {
    console.error('❌ Layout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data'
    });
  }
});

// ==================== INVOICE ROUTES ====================

// Get exhibitor's invoices
router.get('/invoices', async (req, res) => {
  try {
    let invoices = [];
    try {
      const invoiceService = require('../services/InvoiceService');
      if (invoiceService && typeof invoiceService.getInvoicesByExhibitor === 'function') {
        invoices = await invoiceService.getInvoicesByExhibitor(req.user.id);
      }
    } catch (error) {
      console.warn('⚠️ InvoiceService not available:', error.message);
    }
    
    res.json({
      success: true,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download invoice PDF
router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoiceService = require('../services/InvoiceService');
    if (!invoiceService || typeof invoiceService.generateInvoicePdf !== 'function') {
      throw new Error('Invoice service not available');
    }
    
    const pdfBuffer = await invoiceService.generateInvoicePdf(req.params.id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Make payment
router.post('/invoices/:id/pay', async (req, res) => {
  try {
    const { method, transactionId } = req.body;
    
    const invoiceService = require('../services/InvoiceService');
    const paymentService = require('../services/PaymentService');
    
    if (!invoiceService || !paymentService) {
      throw new Error('Required services not available');
    }
    
    // Get invoice
    const invoice = await invoiceService.getInvoiceById(req.params.id);
    
    // Verify invoice belongs to exhibitor
    if (invoice.exhibitorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to pay this invoice'
      });
    }
    
    // Create payment
    const payment = await paymentService.createPayment({
      invoiceId: invoice.id,
      exhibitorId: req.user.id,
      amount: invoice.amount,
      method: method || 'online',
      transactionId: transactionId || `TXN-${Date.now()}`,
      status: 'completed',
      notes: 'Payment made from exhibitor portal'
    });
    
    // Mark invoice as paid if service available
    if (typeof invoiceService.markInvoiceAsPaid === 'function') {
      await invoiceService.markInvoiceAsPaid(invoice.id, payment.id);
    }
    
    res.json({
      success: true,
      message: 'Payment successful',
      data: {
        payment,
        invoice: {
          ...invoice.toJSON(),
          status: 'paid'
        }
      }
    });
  } catch (error) {
    console.error('❌ Payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== REQUIREMENT ROUTES ====================

// Get exhibitor's requirements
router.get('/requirements', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Requirement = modelFactory.getModel('Requirement');
    
    let requirements = [];
    
    if (Requirement) {
      if (process.env.DB_TYPE === 'mysql') {
        requirements = await Requirement.findAll({
          where: { exhibitorId: req.user.id },
          order: [['createdAt', 'DESC']]
        });
      } else {
        requirements = await Requirement.find({ exhibitorId: req.user.id }).sort({ createdAt: -1 });
      }
    }
    
    res.json({
      success: true,
      data: requirements
    });
  } catch (error) {
    console.error('❌ Requirements error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Submit requirement

router.get('/debug/requirements-table', async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    
    // Get table structure
    const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM requirements
    `);
    
    // Get sample data (if any)
    const [sample] = await sequelize.query(`
      SELECT * FROM requirements LIMIT 1
    `);
    
    res.json({
      success: true,
      tableStructure: columns,
      sampleData: sample,
      columnNames: columns.map(c => c.Field)
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.post('/requirements', async (req, res) => {
  try {
    console.log("📝 Submitting requirement for exhibitor:", req.user?.id);
    
    const { type, description, ...restData } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        success: false,
        error: 'Type and description are required'
      });
    }

    // Collect all data
    const completeData = {
      ...restData,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };

    console.log('📦 Saving requirement data...');
    console.log('Keys:', Object.keys(completeData));
    console.log('Housekeeping:', completeData.housekeepingStaff);

    const sequelize = require('../config/database').getConnection('mysql');
    
    // First, check what columns exist
    const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM requirements
    `);
    
    const columnNames = columns.map(c => c.Field);
    console.log('Available columns:', columnNames);
    
    // Generate UUID
    const requirementId = require('crypto').randomUUID();
    const now = new Date();
    
    // Build insert query based on actual columns
    const insertFields = ['id', 'type', 'description', 'quantity', 'status', 'createdAt', 'updatedAt'];
    const insertValues = [requirementId, type, description, 1, 'pending', now, now];
    
    // Check for exhibitorId column (try common variations)
    let exhibitorColumn = null;
    if (columnNames.includes('exhibitorId')) {
      exhibitorColumn = 'exhibitorId';
    } else if (columnNames.includes('exhibitor_id')) {
      exhibitorColumn = 'exhibitor_id';
    } else if (columnNames.includes('exhibitorId')) {
      exhibitorColumn = 'exhibitorId';
    }
    
    if (exhibitorColumn && req.user?.id) {
      insertFields.push(exhibitorColumn);
      insertValues.push(req.user.id);
      console.log(`✅ Adding ${exhibitorColumn} column with value:`, req.user.id);
    } else {
      console.log('⚠️ No exhibitor column found or no user ID');
    }
    
    // Check for data column (or metadata)
    let dataColumn = null;
    if (columnNames.includes('data')) {
      dataColumn = 'data';
    } else if (columnNames.includes('metadata')) {
      dataColumn = 'metadata';
    }
    
    if (dataColumn) {
      insertFields.push(dataColumn);
      insertValues.push(JSON.stringify(completeData));
      console.log(`✅ Adding ${dataColumn} column with data`);
    } else {
      console.log('⚠️ No data/metadata column found');
    }
    
    // Build and execute query
    const placeholders = insertValues.map(() => '?').join(', ');
    const query = `INSERT INTO requirements (${insertFields.join(', ')}) VALUES (${placeholders})`;
    
    console.log('Executing query:', query);
    console.log('Values:', insertValues.map(v => {
      if (typeof v === 'object') return 'JSON_OBJECT';
      if (typeof v === 'string' && v.length > 100) return v.substring(0, 100) + '...';
      return v;
    }));
    
    await sequelize.query(query, {
      replacements: insertValues,
      type: sequelize.QueryTypes.INSERT
    });
    
    console.log('✅ Requirement saved with ID:', requirementId);

    res.json({
      success: true,
      message: 'Requirement submitted successfully',
      data: {
        id: requirementId,
        type: type,
        status: 'pending',
        createdAt: now
      }
    });

  } catch (error) {
    console.error("❌ REQUIREMENT ERROR:", error);
    console.error("Stack:", error.stack);
    
    // Send detailed error in development, generic in production
    res.status(500).json({
      success: false,
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Get booth details
router.get('/booth', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Safely parse stallDetails
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      if (typeof exhibitor.stallDetails === 'string') {
        try {
          stallDetails = JSON.parse(exhibitor.stallDetails);
        } catch (err) {
          console.error('❌ JSON parse error for stallDetails:', err.message);
          stallDetails = {};
        }
      } else {
        stallDetails = exhibitor.stallDetails;
      }
    }

    res.json({
      success: true,
      data: {
        boothNumber: exhibitor.boothNumber || '',
        stallDetails: stallDetails,
        size: stallDetails.size || '',
        type: stallDetails.type || 'standard',
        dimensions: stallDetails.dimensions || '',
        notes: stallDetails.notes || '',
        price: stallDetails.price || '',
        status: stallDetails.status || 'pending'
      }
    });

  } catch (error) {
    console.error('❌ BOOTH ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /booth - Save/Update booth details
router.post('/booth', async (req, res) => {
  try {
    console.log('📦 Saving booth details for exhibitor:', req.user.id);
    console.log('📦 Request body:', req.body);

    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    const {
      boothNumber,
      size,
      type,
      dimensions,
      notes,
      price,
      status,
      organisation,
      contactPerson,
      designation,
      mobile,
      email,
      contractorCompany,
      contractorPerson,
      contractorMobile,
      contractorEmail,
      contractorGST,
      contractorPAN
    } = req.body;

    // Prepare stallDetails object
    const stallDetails = {
      size: size || '',
      type: type || 'standard',
      dimensions: dimensions || '',
      notes: notes || '',
      price: price || '',
      status: status || 'pending',
      organisation: organisation || '',
      contactPerson: contactPerson || '',
      designation: designation || '',
      mobile: mobile || '',
      email: email || '',
      contractorCompany: contractorCompany || '',
      contractorPerson: contractorPerson || '',
      contractorMobile: contractorMobile || '',
      contractorEmail: contractorEmail || '',
      contractorGST: contractorGST || '',
      contractorPAN: contractorPAN || '',
      updatedAt: new Date().toISOString()
    };

    // Get existing metadata to preserve other data
    let metadata = {};
    if (exhibitor.metadata) {
      try {
        metadata = typeof exhibitor.metadata === 'string'
          ? JSON.parse(exhibitor.metadata)
          : exhibitor.metadata;
      } catch (e) {
        metadata = {};
      }
    }

    // Store booth/contractor info in metadata as well for easier access
    metadata.boothDetails = {
      organisation,
      contactPerson,
      designation,
      mobile,
      email,
      contractorCompany,
      contractorPerson,
      contractorMobile,
      contractorEmail,
      contractorGST,
      contractorPAN,
      updatedAt: new Date().toISOString()
    };

    // Update exhibitor
    await exhibitor.update({
      boothNumber: boothNumber || exhibitor.boothNumber,
      stallDetails: JSON.stringify(stallDetails),
      metadata: JSON.stringify(metadata)
    });

    console.log('✅ Booth details saved successfully');

    res.json({
      success: true,
      message: 'Booth details saved successfully',
      data: {
        boothNumber,
        stallDetails,
        metadata: metadata
      }
    });

  } catch (error) {
    console.error('❌ Save booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /booth/contractor - Update contractor details only
router.put('/booth/contractor', async (req, res) => {
  try {
    console.log('📦 Updating contractor details for exhibitor:', req.user.id);

    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Get existing stallDetails
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        stallDetails = typeof exhibitor.stallDetails === 'string'
          ? JSON.parse(exhibitor.stallDetails)
          : exhibitor.stallDetails;
      } catch (e) {
        stallDetails = {};
      }
    }

    // Update only contractor fields
    const {
      contractorCompany,
      contractorPerson,
      contractorMobile,
      contractorEmail,
      contractorGST,
      contractorPAN
    } = req.body;

    const updatedStallDetails = {
      ...stallDetails,
      contractorCompany: contractorCompany || stallDetails.contractorCompany,
      contractorPerson: contractorPerson || stallDetails.contractorPerson,
      contractorMobile: contractorMobile || stallDetails.contractorMobile,
      contractorEmail: contractorEmail || stallDetails.contractorEmail,
      contractorGST: contractorGST || stallDetails.contractorGST,
      contractorPAN: contractorPAN || stallDetails.contractorPAN,
      updatedAt: new Date().toISOString()
    };

    // Update metadata as well
    let metadata = {};
    if (exhibitor.metadata) {
      try {
        metadata = typeof exhibitor.metadata === 'string'
          ? JSON.parse(exhibitor.metadata)
          : exhibitor.metadata;
      } catch (e) {
        metadata = {};
      }
    }

    metadata.boothDetails = {
      ...metadata.boothDetails,
      contractorCompany,
      contractorPerson,
      contractorMobile,
      contractorEmail,
      contractorGST,
      contractorPAN,
      updatedAt: new Date().toISOString()
    };

    await exhibitor.update({
      stallDetails: JSON.stringify(updatedStallDetails),
      metadata: JSON.stringify(metadata)
    });

    res.json({
      success: true,
      message: 'Contractor details updated successfully',
      data: updatedStallDetails
    });

  } catch (error) {
    console.error('❌ Update contractor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /booth/submit - Submit booth for approval
router.post('/booth/submit', async (req, res) => {
  try {
    console.log('📤 Submitting booth for approval for exhibitor:', req.user.id);

    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Get existing stallDetails
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        stallDetails = typeof exhibitor.stallDetails === 'string'
          ? JSON.parse(exhibitor.stallDetails)
          : exhibitor.stallDetails;
      } catch (e) {
        stallDetails = {};
      }
    }

    // Update status to pending approval
    stallDetails.status = 'pending';
    stallDetails.submittedAt = new Date().toISOString();

    await exhibitor.update({
      stallDetails: JSON.stringify(stallDetails),
      status: 'pending' // Also update exhibitor status if needed
    });

    res.json({
      success: true,
      message: 'Booth details submitted for approval successfully'
    });

  } catch (error) {
    console.error('❌ Submit for approval error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /booth/guidelines - Get booth guidelines
router.get('/booth/guidelines', async (req, res) => {
  try {
    const guidelines = {
      fabrication: {
        title: "Booth Fabrication Guidelines",
        rules: [
          "Maximum allowable height for fabricated booths is 4 meters.",
          "Single-use carpet must be laid over entire booth area before construction.",
          "Storing materials behind booth is prohibited.",
          "Each booth must have fire extinguishers."
        ]
      },
      bond: {
        title: "Damage & Performance Bond",
        rules: [
          "Security Deposit DD payable to 'Maxx Business Media Pvt. Ltd.'",
          "Contractors are responsible for removing all packing and waste materials.",
          "Security Deposit refundable after exhibition with receipt.",
          "Upon submission of form and deposit, CONTRACTOR BANDS will be issued."
        ]
      }
    };

    res.json({
      success: true,
      data: guidelines
    });
  } catch (error) {
    console.error('❌ Guidelines error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PAYMENT ROUTES ====================

// GET stall payment + remainders
router.get('/payment', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');
    const { buildStallPayment, schedulePaymentPhases } = require('../utils/stallPayment');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    let stallDetails = {};
    if (exhibitor.stallDetails) {
      if (typeof exhibitor.stallDetails === 'string') {
        try {
          stallDetails = JSON.parse(exhibitor.stallDetails);
        } catch (err) {
          stallDetails = {};
        }
      } else {
        stallDetails = exhibitor.stallDetails;
      }
    }

    let payment = buildStallPayment(stallDetails, stallDetails);
    const unpaidWithoutDates = (payment.paymentPhases || []).every(
      (phase) => !phase.dueDate && phase.status !== 'paid'
    );
    if (unpaidWithoutDates && payment.finalAmount > 0) {
      payment = schedulePaymentPhases(payment);
      exhibitor.stallDetails = { ...stallDetails, ...payment };
      exhibitor.changed('stallDetails', true);
      await exhibitor.save();
    }

    res.json({
      success: true,
      data: {
        boothNumber: exhibitor.boothNumber || '',
        company: exhibitor.company || '',
        boothType: stallDetails.type || '',
        size: stallDetails.size || '',
        lastStallPayment: stallDetails.lastStallPayment || null,
        ...payment,
      }
    });
  } catch (error) {
    console.error('❌ PAYMENT ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/confirm-stall-payment', async (req, res) => {
  try {
    const { recordStallPhasePayment, phaseFromRequirementId, buildStallPayment } = require('../utils/stallPayment');
    const sequelize = require('../config/database').getConnection('mysql');
    const { orderId, phase, paymentId } = req.body || {};

    let phaseNumber = Number(phase) || 0;
    const meta = {
      orderId: orderId || '',
      paymentId: paymentId || '',
      paidAt: new Date().toISOString(),
    };

    if (orderId) {
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS cashfree_orders (
            id VARCHAR(36) PRIMARY KEY,
            order_id VARCHAR(100) UNIQUE NOT NULL,
            invoice_id VARCHAR(36),
            requirement_id VARCHAR(36),
            exhibitor_id VARCHAR(36),
            amount DECIMAL(10,2),
            order_status VARCHAR(50) DEFAULT 'PENDING',
            payment_id VARCHAR(100),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_order_id (order_id),
            INDEX idx_invoice_id (invoice_id)
          )
        `);
        const [orders] = await sequelize.query(
          'SELECT * FROM cashfree_orders WHERE order_id = ? AND exhibitor_id = ?',
          { replacements: [orderId, req.user.id] }
        );
        if (orders && orders.length) {
          const order = orders[0];
          phaseNumber = phaseNumber || phaseFromRequirementId(order.requirement_id);
          meta.orderId = order.order_id;
          meta.paymentId = paymentId || order.payment_id || '';
        }
      } catch (tableErr) {
        console.warn('cashfree_orders lookup skipped:', tableErr.message);
      }
    }

    if (!phaseNumber) {
      return res.status(400).json({ success: false, error: 'Missing stall payment phase' });
    }

    const stallDetails = await recordStallPhasePayment(req.user.id, phaseNumber, meta);
    const payment = buildStallPayment(stallDetails || {}, stallDetails || {});

    res.json({
      success: true,
      data: {
        ...payment,
        lastStallPayment: stallDetails?.lastStallPayment || null,
      },
    });
  } catch (error) {
    console.error('CONFIRM STALL PAYMENT ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MANUAL ROUTES ====================

// Get manual
router.get('/manual', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        sections: [
          {
            id: '1',
            title: 'Event Overview',
            content: 'Welcome to the exhibition. The event will take place from January 29-31, 2024 at the Convention Center.'
          },
          {
            id: '2',
            title: 'Setup Schedule',
            content: 'Setup begins on January 28 from 8:00 AM to 6:00 PM. All exhibitors must complete setup by 6:00 PM.'
          },
          {
            id: '3',
            title: 'Event Hours',
            content: 'Exhibition hours: 9:00 AM - 6:00 PM daily. Networking events: 7:00 PM - 10:00 PM.'
          }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;