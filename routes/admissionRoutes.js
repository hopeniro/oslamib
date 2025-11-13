const express = require('express');
const router = express.Router();
const Patient = require('../models/patient');
const Admission = require('../models/Admission');
const Notification = require('../models/Notification');
const Medical = require('../models/Medical');

// GET /admission - render admission form
router.get('/admission', (req, res) => {
  res.render('admission');
});

// POST /admission/admit - admit patient
router.post('/admission/admit', async (req, res) => {
  try {
    const { patientId, fullName, admissionType, walkIn, referredBy } = req.body;

    // Fetch patient from Patient collection (all patients now exist here)
    const patient = await Patient.findOne({ patientId });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Block admission if patient is archived
    if (patient.isArchived) {
      return res.status(403).json({ error: 'Cannot admit: patient is archived.' });
    }

    // Check if patient has a medical record
    const medicalRecord = await Medical.findOne({ patientId });
    if (!medicalRecord) {
      return res.status(400).json({ error: 'Please create a medical record first.' });
    }

    const birthdate = patient.birthDate;

    // Generate admission ID
    const admittingId = 'ADMT' + Date.now();

    // Create admission record
    const admission = new Admission({
      admittingId,
      patientType: 'regular',
      patientId,
      fullName,
      birthdate: birthdate,
      category: admissionType,
      walkIn: walkIn === 'on',
      referredBy: referredBy || '',
      admittedBy: '',
      dischargeBy: ''
    });
    await admission.save();

    // Create notification for the department with requested phrasing
    const departmentKey = admissionType === 'Emergency' ? 'Emergency' : 'OPD';
    // Build "Last, First" without middle initial and capitalize first letters
    const lastName = patient.lastName ? (patient.lastName.charAt(0).toUpperCase() + patient.lastName.slice(1).toLowerCase()) : '';
    const firstName = patient.firstName ? (patient.firstName.charAt(0).toUpperCase() + patient.firstName.slice(1).toLowerCase()) : '';
    const displayName = `${lastName}, ${firstName}`.trim();

    const message = departmentKey === 'Emergency'
      ? `Patient HRN ${patientId} ${displayName} for Emergency Medical Attention`
      : `Patient HRN ${patientId} ${displayName} for Outpatient Consultation`;

    const notification = new Notification({
      patientId,
      fullName: displayName,
      message,
      department: departmentKey,
      read: false
    });
    await notification.save();

    res.json({ success: true, message: 'Patient admitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to admit patient' });
  }
});

module.exports = router;
