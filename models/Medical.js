const mongoose = require('mongoose');

const medicalSchema = new mongoose.Schema({
  medicalId: String,
  patientId: String, // Permanent Patient ID (or use ObjectId if referencing)
  tempId: String,    // Temporary ID from OnHold.js
  patientName: String,
  isPWD: String, // '1' if checked
  isIPS: String,
  isSC: String,
  isPregnant: String,
  spouseName: String,
  contactNumber: String,
  fatherName: String,
  motherName: String,
  allergicTo: String,
  height: String,
  weight: String,
  bmi: String,
  bloodPressure: String,
  temperature: String,
  respiratoryRate: String,
  heartRate: String,
  oxygenSaturation: String,
  glucoseLevel: String,
  chiefComplaint: String,
  allergies: String,
  currentMedication: String,
  pastHistory: String,
  familyHistory: String,
  smoking: String,
  alcohol: String,
  occupation: String,
  exercise: String,
  diagnose: [{
    date: { type: Date, required: true },
    complaint: { type: String },
    doctor_order: { type: String },
    nurse_assist: { type: String },
    doctor: { type: String }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Medical', medicalSchema);
