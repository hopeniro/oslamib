const mongoose = require('mongoose');

const dischargedPatientSchema = new mongoose.Schema({
  admittingId: { type: String, required: true },
  patientId: { type: String, required: true }, // HRN
  patientRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  fullName: String,
  birthdate: Date,
  department: String,
  admittedAt: Date,
  dischargedAt: { type: Date, default: Date.now },
  dischargedBy: String,
  clearedBy: String,
  notes: String,
  // Snapshot of diagnoses for this admission only
  diagnoses: [
    {
      date: Date,
      complaint: String,
      doctor_order: String,
      nurse_assist: String,
      doctor: String
    }
  ],
  // Snapshot of transactions for this admission only
  transactions: [
    {
      transactionId: String,
      status: String,
      createdAt: Date,
      services: [mongoose.Schema.Types.Mixed]
    }
  ]
}, { timestamps: true });

module.exports = mongoose.models.DischargedPatient || mongoose.model('DischargedPatient', dischargedPatientSchema);
