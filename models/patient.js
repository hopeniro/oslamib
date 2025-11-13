const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientId: { type: String, index: true, unique: true, sparse: true }, // HRN
  firstName: String,
  lastName: String,
  middleInitial: String,
  birthDate: Date,
  gender: String,
  edad: String,
  civilStatus: String,
  address: String,
  contactInfo: String,
  clothes: String,
  onHoldStatus: [String],
  foundLocation: String,
  religion: String,
  emergencyContactName: String,
  emergencyContactNumber: String,
  // Vitals
  bp: String,
  hr: String,
  rr: String,
  temp: String,
  spo2: String,
  height: String,
  weight: String,
  lmp: Date,
  registrationDate: { type: Date, default: Date.now },
  // Archive fields (soft delete)
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: String, default: null },
  archivedFrom: { type: String, default: null }, // Department who archived
  archiveReason: { type: String, default: null }
});

// Prevent OverwriteModelError
module.exports = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
