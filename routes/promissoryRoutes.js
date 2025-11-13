const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Promissory = require('../models/Promissory');
const Patient = require('../models/patient');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const Admission = require('../models/Admission');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/promissory');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'promissory-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    console.log('File mimetype:', file.mimetype);
    console.log('File originalname:', file.originalname);
    
    // Allow common image formats
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    const allowedExts = /\.(jpg|jpeg|png|gif|bmp|webp)$/i;
    
    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExt = allowedExts.test(file.originalname);
    
    if (hasValidMime || hasValidExt) {
      return cb(null, true);
    } else {
      console.log('Rejected file:', file.mimetype, file.originalname);
      cb(null, false); // Reject silently instead of throwing error
    }
  }
});

// GET /promissory - View all promissory notes
router.get('/promissory', async (req, res) => {
  try {
    const promissories = await Promissory.find().sort({ dateIssued: -1 });
    
    // Enrich with patient names
    const enrichedPromissories = [];
    for (const p of promissories) {
      const patient = await Patient.findOne({ 
        $or: [{ patientId: p.patientId }, { tempId: p.patientId }]
      });
      
      const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      
      enrichedPromissories.push({
        ...p.toObject(),
        patientName: patient ? `${capitalize(patient.lastName)}, ${capitalize(patient.firstName)}` : 'Unknown'
      });
    }
    
    res.render('promissory', { promissories: enrichedPromissories });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading promissory notes');
  }
});

// GET /promissory/invoice/:id - View promissory invoice with action buttons
router.get('/promissory/invoice/:id', async (req, res) => {
  try {
    const promissory = await Promissory.findById(req.params.id);
    if (!promissory) {
      return res.status(404).send('Promissory note not found');
    }
    
    const patient = await Patient.findOne({ 
      $or: [{ patientId: promissory.patientId }, { tempId: promissory.patientId }]
    });
    
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    
    const patientName = `${patient.firstName} ${patient.lastName}`;
    const patientAddress = patient.address || '';
    // Compute age
    let age = null;
    if (patient.birthDate) {
      const today = new Date();
      const bd = new Date(patient.birthDate);
      age = today.getFullYear() - bd.getFullYear();
      const m = today.getMonth() - bd.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    }
    
    // Calculate total amount from transactions using patient's MongoDB _id
    const transactions = await Transaction.find({ patientId: patient._id.toString() });
    let totalAmount = 0;
    transactions.forEach(tx => {
      if (tx.services && Array.isArray(tx.services)) {
        tx.services.forEach(service => {
          totalAmount += service.amount || 0;
        });
      }
    });
    const remainingBalance = totalAmount - promissory.amount;
    
    res.render('promissoryInvoice', { 
      promissory, 
      patientName,
      patientAddress,
      age,
      totalAmount,
      remainingBalance
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading promissory invoice');
  }
});

// POST /promissory/submit - Submit new promissory note
router.post('/promissory/submit', upload.single('image'), async (req, res) => {
  try {
    const { patientId, amount, paymentExpected, notes } = req.body;
    
    console.log('Promissory submission received:', { patientId, amount, hasFile: !!req.file });
    
    // Get patient's transactions and current admission
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    
    const transactions = await Transaction.find({ patientId });
    const transactionIds = transactions.map(t => t.transactionId);
    
    // Get the current (latest) admission for this patient to tie the promissory to that admission
    const admission = await Admission.findOne({ 
      patientId: patient.patientId || patient.tempId 
    }).sort({ dateAdmitted: -1 });
    
    const promissory = new Promissory({
      patientId: patient.patientId || patient.tempId,
      transactionIds,
      admissionNumber: admission ? admission.admissionNumber : null, // Tie promissory to current admission
      amount: parseFloat(amount),
      paymentExpected: new Date(paymentExpected),
      notes,
      imagePath: req.file ? '/uploads/promissory/' + req.file.filename : null,
      status: 'Pending'
    });
    
    await promissory.save();
    
    // Create notification for Promissory department
    const notification = new Notification({
      patientId: patient.patientId || patient.tempId,
      fullName: `${patient.lastName}, ${patient.firstName}`,
      message: `Patient HRN ${patient.patientId || patient.tempId} ${patient.lastName}, ${patient.firstName} submit promissory`,
      department: 'Promissory'
    });
    await notification.save();
    
    // Emit socket.io event if available
    if (req.app.get('io')) {
      req.app.get('io').emit('new-notification', {
        department: 'Promissory',
        notification
      });
    }
    
    console.log('Promissory submitted successfully:', promissory._id);
    res.json({ success: true, promissory });
  } catch (err) {
    console.error('Error submitting promissory:', err);
    res.status(500).json({ success: false, error: 'Error submitting promissory note: ' + err.message });
  }
});

// POST /promissory/update-status - Update promissory status
router.post('/promissory/update-status', async (req, res) => {
  try {
    const { promissoryId, status, rejectionReason } = req.body;
    
    const promissory = await Promissory.findById(promissoryId);
    if (!promissory) {
      return res.status(404).json({ error: 'Promissory note not found' });
    }
    
    // Save previous state for audit
    const before = promissory.toObject();

    promissory.status = status;

    if (status === 'Approved') {
      promissory.dateApproved = new Date();
      promissory.approvedBy = req.session?.username || 'Admin';
      promissory.dateRejected = undefined;
      promissory.rejectedBy = undefined;
      promissory.rejectionReason = undefined;
    }
    if (status === 'Rejected') {
      promissory.dateRejected = new Date();
      promissory.rejectedBy = req.session?.username || 'Admin';
      promissory.rejectionReason = rejectionReason || 'No reason provided';
      promissory.dateApproved = undefined;
      promissory.approvedBy = undefined;
    }

    await promissory.save();

    // Audit log entry
    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        userId: req.session?.userId || 'unknown',
        username: req.session?.username || 'unknown',
        action: 'update',
        recordType: 'Promissory',
        recordId: promissory._id.toString(),
        before,
        after: promissory.toObject(),
        details: { status, rejectionReason }
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }

    // Notify Billing department on approve/reject
    try {
      const patient = await Patient.findOne({ 
        $or: [{ patientId: promissory.patientId }, { tempId: promissory.patientId }]
      });
      if (patient) {
        const hrn = patient.patientId || patient.tempId || promissory.patientId;
        const fullName = `${patient.lastName}, ${patient.firstName}`;
        const note = new Notification({
          patientId: hrn,
          fullName,
          message: `Patient HRN ${hrn} ${fullName} promissory ${status.toLowerCase()}`,
          department: 'Billing',
          read: false
        });
        await note.save();

        const io = req.app.get('io');
        if (io) {
          io.emit('new-notification', { department: 'Billing', notification: note });
          io.emit('billingRefresh');
        }
      }
    } catch (e) {
      console.error('Error sending billing notification:', e);
    }
    
    res.json({ success: true, promissory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating status' });
  }
});

// POST /promissory/update-amount - Update promissory amount
router.post('/promissory/update-amount', async (req, res) => {
  try {
    const { promissoryId, amount } = req.body;
    
    const promissory = await Promissory.findById(promissoryId);
    if (!promissory) {
      return res.status(404).json({ error: 'Promissory note not found' });
    }
    
    if (promissory.status !== 'Pending') {
      return res.status(400).json({ error: 'Can only edit amount for pending promissory notes' });
    }
    
    promissory.amount = parseFloat(amount);
    await promissory.save();
    
    res.json({ success: true, promissory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating amount' });
  }
});

module.exports = router;
