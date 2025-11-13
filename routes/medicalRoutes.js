const express = require('express');
const router = express.Router();
const Medical = require('../models/Medical');
const Patient = require('../models/patient');
const Admission = require('../models/Admission');
const ProcessedPatient = require('../models/ProcessedPatient');

// GET medical form page
router.get('/medical', async (req, res) => {
  const patientId = req.query.patientId;
  let isProcessed = false;
  
  // Check if patient is processed
  if (patientId) {
    const processed = await ProcessedPatient.findOne({ patientId, processed: true });
    isProcessed = !!processed;
  }
  
  res.render('medical', {
    success: req.query.success,
    error: req.query.error,
    isProcessed
  });
});

// GET route for patient search
router.get('/api/patients/search', async (req, res) => {
  try {
    const searchTerm = req.query.term;

    const patientResults = await Patient.find({
      $or: [
        { patientId: searchTerm },
        { lastName: new RegExp(searchTerm, 'i') }
      ]
    });

    const combinedResults = patientResults.map(p => ({
      patientId: p.patientId,
      name: `${p.firstName} ${p.lastName}`,
      tempId: null
    }));

    res.json(combinedResults);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).send("Search failed");
  }
});

router.post('/medical', async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.redirect('/medical?error=Missing patient ID.');
    }

    // Search in Patients by exact patientId
    const foundPatient = await Patient.findOne({ patientId: patientId });

    if (!foundPatient) {
      return res.redirect('/medical?error=Patient not found.');
    }

    // Block creating medical record if patient is archived
    if (foundPatient.isArchived) {
      return res.redirect('/medical?error=' + encodeURIComponent('Cannot create medical record: patient is archived.'));
    }

    // Prevent duplicate medical record for same patient
    const existingRecord = await Medical.findOne({ patientId: patientId });
    if (existingRecord) {
      return res.redirect('/medical?error=Medical record already exists for this patient.');
    }

    // Construct patient name
    const firstName = foundPatient.firstName || '';
    const middleInitial = foundPatient.middleInitial ? `${foundPatient.middleInitial}.` : '';
    const lastName = foundPatient.lastName || '';
    const patientName = `${firstName} ${middleInitial} ${lastName}`.replace(/\s+/g, ' ').trim();

    // Generate new medicalId
    const lastRecord = await Medical.findOne().sort({ _id: -1 });
    let count = 1;
    if (lastRecord) {
      const lastId = parseInt(lastRecord.medicalId.split('-')[2]);
      count = lastId + 1;
    }
    const medicalId = `MED-2025-${String(count).padStart(4, '0')}`;

    // Save the medical record
    const newMedical = new Medical({
      medicalId,
      patientId: patientId,
      patientName,
      height: req.body.height,
      weight: req.body.weight,
      bmi: req.body.bmi,
      bloodPressure: req.body.bloodPressure,
      temperature: req.body.temperature,
      respiratoryRate: req.body.respiratoryRate,
      heartRate: req.body.heartRate,
      oxygenSaturation: req.body.oxygenSaturation,
      bloodGlucose: req.body.glucoseLevel,
      chiefComplaint: req.body.chiefComplaint,
      allergies: req.body.allergies,
      currentMedication: req.body.currentMedication,
      pastMedicalHistory: req.body.pastHistory,
      familyHistory: req.body.familyHistory,
      smoking: req.body.smoking,
      alcoholUse: req.body.alcohol,
      occupation: req.body.occupation,
      exercise: req.body.exercise
    });

    await newMedical.save();
    return res.redirect('/medical?success=Medical record saved successfully.');
  } catch (err) {
    console.error("POST /medical error:", err);
    return res.redirect('/medical?error=Error saving medical record.');
  }
});

// Get medical record by patientId
router.get('/api/medical/:id', async (req, res) => {
  const med = await Medical.findOne({ patientId: req.params.id });
  res.json(med || {});
});

// Update medical record
router.post('/medical/update', async (req, res) => {
  const { patientId, ...fields } = req.body;
  
  // Check if patient is archived before allowing update
  const patient = await Patient.findOne({ patientId });
  if (patient && patient.isArchived) {
    return res.status(403).json({ success: false, error: 'Cannot update medical record: patient is archived.' });
  }

  let med = await Medical.findOne({ patientId });
  if (med) {
    Object.assign(med, fields);
    await med.save();
  } else {
    med = new Medical({ patientId, ...fields });
    await med.save();
  }
  res.json({ success: true });
});

// Check if patient is already admitted
router.get('/api/admission-status/:patientId', async (req, res) => {
  try {
    const admission = await Admission.findOne({ 
      patientId: req.params.patientId 
    }).sort({ dateAdmitted: -1 }); // Get most recent admission
    
    if (admission) {
      res.json({
        isAdmitted: true,
        admissionInfo: {
          admittingId: admission.admittingId,
          category: admission.category,
          dateAdmitted: admission.dateAdmitted
        }
      });
    } else {
      res.json({ isAdmitted: false });
    }
  } catch (err) {
    console.error('Error checking admission status:', err);
    res.status(500).json({ error: 'Failed to check admission status' });
  }
});

module.exports = router;

