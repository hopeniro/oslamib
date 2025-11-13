// routes/admittingList.js
const express = require('express');
const router = express.Router();
const Patient = require('../models/patient');
const TransactionType = require('../models/TransactionType');
const Admission = require('../models/Admission');

function generateAdmittingId() {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ADMT${new Date().getFullYear()}${random}`;
}

// Function to generate unique admitting ID
function generateAdmittingId() {
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `ADMT${new Date().getFullYear()}${random}`;
}

// GET: Admission form
router.get('/admission/:id', async (req, res) => {
  const { id } = req.params;
  const { type } = req.query;
  let data = {};
  let patientType = 'regular';

  try {
    const patient = await Patient.findOne({ patientId: id });
    if (!patient) return res.status(404).send('Patient not found');
    
    data = {
      id: patient.patientId,
      name: `${patient.firstName} ${patient.middleInitial} ${patient.lastName}`,
    };

    const transactionTypes = await TransactionType.find();
    const admittingId = generateAdmittingId();

    res.render('admission', {
      patientData: data,
      patientType,
      transactionTypes,
      admittingId,
    });
  } catch (err) {
    console.error('Error loading admission form:', err);
    res.status(500).send('Server Error');
  }
});

// POST: Submit admission form
router.post('/submit-admission', async (req, res) => {
  const {
    admittingId,
    patientType,
    id,
    category,
    referralLocation = '',
    referredDoctor = '',
    services = []
  } = req.body;

  try {
    const patient = await Patient.findOne({ patientId: id });
    const fullName = patient 
      ? `${patient.firstName} ${patient.middleInitial} ${patient.lastName}` 
      : 'Unknown';

    const selectedServices = Array.isArray(services) ? services : [services];

    const admission = new Admission({
      admittingId,
      patientType,
      patientId: id,
      fullName,
      category,
      referralLocation,
      referredDoctor,
      services: selectedServices
    });

    await admission.save();

    res.send('Admission saved successfully!');
  } catch (err) {
    console.error('Error saving admission:', err);
    res.status(500).send('Server Error');
  }
});


router.get('/admit-list', async (req, res) => {
  try {
    const { success, error } = req.query;
    const ProcessedPatient = require('../models/ProcessedPatient');
    
    // Exclude archived patients from main list
    const patients = await Patient.find({ isArchived: { $ne: true } }, {
      _id: 0,
      patientId: 1,
      firstName: 1,
      lastName: 1,
      middleInitial: 1,
      birthDate: 1,
      gender: 1,
      address: 1
    }).sort({ registrationDate: -1 });

    // Get processed status for all patients
    const processedRecords = await ProcessedPatient.find({});
    const processedMap = {};
    processedRecords.forEach(rec => {
      processedMap[rec.patientId] = rec.processed;
    });

    // Get admission status for these patients (if any Admission exists for patientId)
    const ids = patients.map(p => p.patientId);
    const admissions = await Admission.find({ patientId: { $in: ids } }, { patientId: 1 });
    const admittedMap = {};
    admissions.forEach(a => { admittedMap[a.patientId] = true; });

    res.render('admitList', {
      patients,
      processedMap,
      admittedMap,
      success: success || null,
      error: error || null
    });
  } catch (err) {
    console.error('Error fetching data for admit list:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/admit/:patientId', (req, res) => {
  // logic to admit registered patient
  res.redirect('/admit-list');
});

router.post('/admit/onhold/:tempId', (req, res) => {
  // logic to admit on-hold patient
  res.redirect('/admit-list');
});

// GET: Archived patients list
router.get('/patient-archive', async (req, res) => {
  try {
    const { success, error } = req.query;
    
    // Query only archived patients
    const patients = await Patient.find({ isArchived: true }, {
      _id: 0,
      patientId: 1,
      firstName: 1,
      lastName: 1,
      middleInitial: 1,
      birthDate: 1,
      gender: 1,
      address: 1,
      isArchived: 1,
      archivedAt: 1,
      archivedBy: 1,
      archivedFrom: 1,
      archiveReason: 1
    }).sort({ archivedAt: -1 });

    res.render('patientarchieve', {
      patients,
      success: success || null,
      error: error || null
    });
  } catch (err) {
    console.error('Error fetching archived patients:', err);
    res.status(500).send('Server Error');
  }
});



module.exports = router;
