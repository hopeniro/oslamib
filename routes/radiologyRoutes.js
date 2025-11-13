const express = require('express');
const router = express.Router();

const Admission = require('../models/Admission');
const Medical = require('../models/Medical');
const Patient = require('../models/patient');
const DoctorSchedule = require('../models/DoctorSchedule');
const NurseSchedule = require('../models/NurseSchedule');
const Doctor = require('../models/Doctor');
const Nurse = require('../models/Nurse');

// 📍 List all Radiology patients from Admission collection
router.get('/radiology', async (req, res) => {
  try {
    const erPatients = await Admission.find({
      category: { $regex: /^Radiology$/i }
    });
    res.render('radiology', { patients: erPatients });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 📍 View Radiology patient details with admission info & medical records
router.get('/radiology/view/:id', async (req, res) => {
  const id = req.params.id;
  try {
    // Find patient by patientId
    const patient = await Patient.findOne({ patientId: id });
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Find related medical records for this patient
    const medicalRecords = await Medical.find({ patientId: id });

    // Get current weekday short form (e.g. 'Mon', 'Tue')
    const day = new Date().toLocaleDateString('en-US', { weekday: 'short' });

    // Get doctor & nurse schedules for the current day
    const doctorSchedules = await DoctorSchedule.find({ date: day });
    const nurseSchedules = await NurseSchedule.find({ date: day });

    // Extract IDs of doctors and nurses scheduled today
    const doctorIds = doctorSchedules.map(d => d.doctorId);
    const nurseIds = nurseSchedules.map(n => n.nurseId);

    // Fetch available doctors and nurses using the IDs
    const availableDoctors = await Doctor.find({ doctorId: { $in: doctorIds } });
    const availableNurses = await Nurse.find({ nurseId: { $in: nurseIds } });

    // Fetch admission details for this patient
    const admission = await Admission.findOne({ patientId: id });

    // Prepare detailed services array safely for the view
    let detailedServices = [];
    if (admission && Array.isArray(admission.services) && admission.services.length) {
      detailedServices = admission.services.map(service => ({
        transactionType: admission.category || '',
        description: typeof service === 'string' ? service : (service.description || ''),
        amount: service.amount || 0
      }));
    }

    // Render the Radiology detailed view with all info
    res.render('viewRadiologyRequest', {
      patient,
      medicalRecords,
      availableDoctors,
      availableNurses,
      admission,
      detailedServices,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading patient data');
  }
});

// 📍 Add diagnosis entry to a medical record for a Radiology patient
router.post('/radiology/view/:id/diagnose', async (req, res) => {
  const { id } = req.params;
  const { medicalId, date, complaint, doctor_order, nurse_assist, doctor } = req.body;

  try {
    // Find patient - check if it's MongoDB ObjectId or patientId (HRN)
    let patient;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      patient = await Patient.findById(id);
    } else {
      // It's a patientId (HRN)
      patient = await Patient.findOne({ patientId: id });
    }
    
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Validate Medical record existence
    const medical = await Medical.findById(medicalId);
    if (!medical) {
      return res.status(404).send('Medical record not found');
    }

    // Get full names for doctor and nurse based on selected IDs
    const selectedDoctor = await Doctor.findOne({ doctorId: doctor });
    const selectedNurse = await Nurse.findOne({ nurseId: nurse_assist });

    const doctorFullName = selectedDoctor
      ? `${selectedDoctor.firstName} ${selectedDoctor.middleName || ''} ${selectedDoctor.lastName}`.trim()
      : 'Unknown Doctor';

    const nurseFullName = selectedNurse
      ? `${selectedNurse.firstName} ${selectedNurse.middleInitial || ''} ${selectedNurse.lastName}`.trim()
      : 'Unknown Nurse';

    // Update the medical record by pushing new diagnosis data
    await Medical.findByIdAndUpdate(medicalId, {
      $push: {
        diagnose: {
          date,
          complaint,
          doctor_order,
          nurse_assist: nurseFullName,
          doctor: doctorFullName
        }
      }
    });

    res.redirect(`/radiology/view/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
});

// 📍 Request additional services for Radiology patient (lab, x-ray, etc.)
router.post('/radiology/view/:id/request-service', async (req, res) => {
  try {
    const {
      category,
      labSubcategory,
      referralLocation,
      referredDoctor,
      services,
      patientId,
      fullName,
      patientType = 'regular' // Default fallback
    } = req.body;

    // Use subcategory for Laboratory, otherwise main category
    const selectedCategory = category === 'Laboratory' ? labSubcategory : category;

    // Build admission data object
    const admissionData = {
      admittingId: 'radiology' + Date.now().toString(36).toUpperCase(),
      patientType,
      fullName,
      category: selectedCategory,
      referralLocation,
      referredDoctor,
      services: Array.isArray(services) ? services : [services],
      patientId: patientId // Always use patientId since all patients have one now
    };

    const newAdmission = new Admission(admissionData);
    await newAdmission.save();

    res.redirect(`/radiology/view/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing service request.");
  }
});

module.exports = router;
