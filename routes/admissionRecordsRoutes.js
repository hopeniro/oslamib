const express = require('express');
const router = express.Router();
const Patient = require('../models/patient');
const ProcessedPatient = require('../models/ProcessedPatient');
const Notification = require('../models/Notification');

// Get all patients for admissionrecords.ejs
router.get('/admissionrecords', async (req, res) => {
  const records = await Patient.find().sort({ registrationDate: -1 });
  res.render('admissionrecords', { records });
});

// Mark patient as processed and create notification
router.post('/processPatient', async (req, res) => {
  try {
    const { patientId } = req.body;
    
    // Get patient details
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    
    // Construct full name with capitalized first letters
    const lastName = patient.lastName.charAt(0).toUpperCase() + patient.lastName.slice(1).toLowerCase();
    const firstName = patient.firstName.charAt(0).toUpperCase() + patient.firstName.slice(1).toLowerCase();
    const fullName = `${lastName}, ${firstName}`;
    
    await ProcessedPatient.updateOne(
      { patientId },
      { $set: { processed: true, processedAt: new Date() } },
      { upsert: true }
    );
    
    await Notification.create({
      patientId,
      fullName: fullName,
      message: `Patient HRN ${patientId} ${fullName} for admitting`,
      department: 'Admission',
      read: false
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error processing patient:', err);
    res.status(500).json({ success: false, error: 'Failed to process patient' });
  }
});

// Cancel processing (only if not yet admitted)
router.post('/cancelProcessPatient', async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ success: false, error: 'Missing patientId' });

    // Block cancel if patient already has an Admission record
    const Admission = require('../models/Admission');
    const admitted = await Admission.findOne({ patientId });
    if (admitted) {
      return res.status(409).json({ success: false, error: 'Patient already admitted. Cannot cancel.' });
    }

    const ProcessedPatient = require('../models/ProcessedPatient');
    await ProcessedPatient.updateOne(
      { patientId },
      { $set: { processed: false }, $unset: { processedAt: '' } },
      { upsert: true }
    );

    // Send cancellation notification to Admission
    try {
      const p = await Patient.findOne({ patientId });
      const lastName = p && p.lastName ? (p.lastName.charAt(0).toUpperCase() + p.lastName.slice(1).toLowerCase()) : '';
      const firstName = p && p.firstName ? (p.firstName.charAt(0).toUpperCase() + p.firstName.slice(1).toLowerCase()) : '';
      const displayName = `${lastName}, ${firstName}`.trim();

      await Notification.create({
        patientId,
        fullName: displayName,
        message: `Patient HRN ${patientId} ${displayName} Admission Cancelled`,
        department: 'Admission',
        read: false
      });
    } catch (notifyErr) {
      console.warn('Failed to create cancel notification:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error canceling process for patient:', err);
    return res.status(500).json({ success: false, error: 'Failed to cancel process' });
  }
});

module.exports = router;
