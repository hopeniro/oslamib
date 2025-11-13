const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');
const Department = require('../models/Department');
const Duty = require('../models/Duty');

// Add department
router.post('/add-department', async (req, res) => {
  await Department.create({ department: req.body.department });
  res.redirect('/nurse');
});

// Add duty
router.post('/add-duty', async (req, res) => {
  await Duty.create({ duty: req.body.duty });
  res.redirect('/nurse');
});

// Register nurse
// Auto-generate NUR2025XXXX
router.post('/register-nurse', async (req, res) => {
  const { firstName, middleInitial, lastName, birthday, gender, contact, address, email, departments, duties, licenseNumber, validUntil } = req.body;

  // Basic server-side validation
  const contactOk = /^\d{11}$/.test((contact || '').trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
  if (!contactOk) {
    return res.status(400).send('Invalid contact number. It must be exactly 11 digits.');
  }
  if (!emailOk) {
    return res.status(400).send('Invalid email format.');
  }

  const currentYear = new Date().getFullYear();
  const prefix = `NUR${currentYear}`;

  const nurseCount = await Nurse.countDocuments({ nurseId: { $regex: `^${prefix}` } });
  const paddedNumber = (nurseCount + 1).toString().padStart(4, '0');
  const nurseId = `${prefix}${paddedNumber}`;

  // Normalize optional arrays (departments/duties may be undefined from UI)
  const safeDepartments = Array.isArray(departments)
    ? departments.filter(Boolean)
    : (departments ? [departments] : []);
  const safeDuties = Array.isArray(duties)
    ? duties.filter(Boolean)
    : (duties ? [duties] : []);

  await Nurse.create({
    nurseId,
    firstName,
    middleInitial,
    lastName,
    birthday,
    gender,
    contact,
    address,
    email,
    departments: safeDepartments,
    duties: safeDuties,
    licenseNumber,
    validUntil,
    status: 'active'
  });

  res.redirect('/nurse');
});

// GET nurse management page
router.get('/nurse', async (req, res) => {
  const nurses = await Nurse.find();
  const departments = await Department.find();
  const duties = await Duty.find();
  
  // Compute effective status for each nurse
  const today = new Date();
  const nursesWithStatus = nurses.map(nurse => {
    const nurseObj = nurse.toObject();
    const isLicenseExpired = nurse.validUntil && new Date(nurse.validUntil) < today;
    
    nurseObj.effectiveStatus = isLicenseExpired ? 'expired' : nurse.status;
    nurseObj.canChangeStatus = !isLicenseExpired;
    
    return nurseObj;
  });
  
  res.render('nurse.ejs', { nurses: nursesWithStatus, departments, duties });
});

// Toggle nurse status
router.post('/toggle-nurse-status', async (req, res) => {
  try {
    const { nurseId, status } = req.body;
    const nurse = await Nurse.findOne({ nurseId });
    
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }
    
    // Check if license is expired
    const today = new Date();
    const isExpired = nurse.validUntil && new Date(nurse.validUntil) < today;
    
    if (isExpired) {
      return res.status(400).json({ error: 'Cannot activate nurse with expired license' });
    }
    
    nurse.status = status;
    await nurse.save();
    
    res.json({ success: true, status: nurse.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
