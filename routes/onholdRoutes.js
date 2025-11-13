// routes/onholdRoutes.js
const express = require('express');
const router = express.Router();
const moment = require('moment');
const OnHold = require('../models/OnHold');
const Patient = require('../models/patient');

// HRN generator — format: YY-00-00-XX where XX increments per new patient or on-hold
async function generateHRN() {
  const yy = moment().format('YY');
  const prefix = `${yy}-00-00-`;

  // Find the most recent patient and on-hold with this prefix and take the highest suffix
  const lastPatient = await Patient.findOne({ patientId: { $regex: `^${prefix}` } }).sort({ patientId: -1 }).exec().catch(()=>null);
  const lastOnHold = await OnHold.findOne({ tempId: { $regex: `^${prefix}` } }).sort({ tempId: -1 }).exec().catch(()=>null);

  let lastSeq = 0;
  if (lastPatient && lastPatient.patientId) {
    const parts = lastPatient.patientId.split('-');
    const n = parseInt(parts[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }
  if (lastOnHold && lastOnHold.tempId) {
    const parts = lastOnHold.tempId.split('-');
    const n = parseInt(parts[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }

  const next = String(lastSeq + 1).padStart(2, '0');
  return `${prefix}${next}`;
}

// GET /onhold - show registration form for unidentified patients
router.get('/onhold', async (req, res) => {
  try {
    const { success, error } = req.query;
    // Generate next HRN
    const hrn = await generateHRN();
    const regDate = moment().format('YYYY-MM-DD HH:mm:ss');

    res.render('onhold', {
      success,
      error,
      hrn,
      regDate
    });
  } catch (err) {
    console.error('Error loading /onhold page:', err);
    res.render('onhold', {
      error: 'Something went wrong while loading the form.',
      success: null,
      hrn: await generateHRN()
    });
  }
});

// POST /onhold - process unidentified patient registration
router.post('/onhold', async (req, res) => {
  try {
    const {
      estimateAge,
      clothes,
      locationFound,
      status,
      dateTimeFound
    } = req.body;

    // Generate tempId (HRN) that maintains sequence with regular patients
    const tempId = await generateHRN();

    // Convert status to array if it's a single value
    const statusArray = Array.isArray(status) ? status : (status ? [status] : []);

    const newOnHold = new OnHold({
      tempId,
      estimateAge,
      clothes,
      dateTimeFound: dateTimeFound || moment().format('YYYY-MM-DD HH:mm:ss'),
      locationFound,
      status: statusArray
    });

    // Attempt save, retrying HRN generation if unique constraint collides
    let saved = false;
    let attempts = 0;
    while (!saved && attempts < 3) {
      attempts++;
      try {
        await newOnHold.save();
        saved = true;
      } catch (saveErr) {
        if (saveErr && saveErr.code === 11000 && attempts < 3) {
          newOnHold.tempId = await generateHRN();
          continue;
        }
        throw saveErr;
      }
    }

    // OPTION A: Create a matching Patient record immediately
    // This becomes the single source of truth for all transactions/admissions
    const newPatient = new Patient({
      patientId: newOnHold.tempId,
      firstName: 'unidentified',
      lastName: '',
      middleInitial: '',
      birthDate: undefined,
      gender: 'unknown',
      edad: estimateAge || '',
      civilStatus: '',
      address: '',
      foundLocation: locationFound || '',
      contactInfo: '',
      clothes: clothes || '',
      onHoldStatus: statusArray,
      religion: '',
      bp: '',
      hr: '',
      rr: '',
      temp: '',
      spo2: '',
      height: '',
      weight: '',
      lmp: undefined,
      registrationDate: dateTimeFound ? new Date(dateTimeFound) : new Date()
    });

    await newPatient.save();

    // Redirect back to onhold with success message and next HRN
    const nextHrn = await generateHRN();
    res.render('onhold', {
      success: `Successfully registered unidentified patient with HRN: ${newOnHold.tempId}`,
      hrn: nextHrn,
      regDate: moment().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (err) {
    console.error('Error saving unidentified patient:', err);
    res.render('onhold', {
      error: 'Error saving unidentified patient data',
      success: null,
      hrn: await generateHRN()
    });
  }
});

// Search patients by name or ID
router.get('/search-patient', async (req, res) => {
  const query = req.query.q;
  const regex = new RegExp(query, 'i');
  try {
    const patients = await Patient.find({
      $or: [
        { patientId: regex },
        { firstName: regex },
        { lastName: regex }
      ]
    });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching patients' });
  }
});

// Assign patient to OnHold
router.post('/assign-patient-to-onhold', async (req, res) => {
  const { onHoldId, patientId } = req.body;
  try {
    await OnHold.findByIdAndUpdate(onHoldId, { patientId });
    res.redirect('/onholdlist'); // Redirect after successful assignment
  } catch (err) {
    res.status(500).json({ message: 'Error assigning patient' });
  }
});

module.exports = router;
