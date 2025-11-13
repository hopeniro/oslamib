const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema({
  admittingId: String,       // e.g., ADMT2025OVZ25
  patientType: String,       // 'regular' or 'temp'
  patientId: String,         // ID of patient (HRN)
  fullName: String,          // patient's name or "Temporary"
  birthdate: Date,           // patient's birthdate
  category: String,          // e.g., "Emergency", "Out Patient Department"
  walkIn: Boolean,           // walk-in patient or not
  referredBy: String,        // who referred the patient
  admittedBy: String,        // who admitted the patient (blank for now)
  dischargeBy: String,       // nurse ID for discharge
  dateAdmitted: {
    type: Date,
    default: Date.now
  },
  admittedAt: {
    type: Date,
    default: Date.now
  },
  // Clearing and discharge workflow flags
  isCleared: { type: Boolean, default: false },
  clearedAt: { type: Date },
  clearedBy: { type: String },
  discharged: { type: Boolean, default: false },
  dischargedAt: { type: Date }
});

module.exports = mongoose.models.Admission || mongoose.model('Admission', admissionSchema);
