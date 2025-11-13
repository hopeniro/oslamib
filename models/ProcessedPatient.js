const mongoose = require('mongoose');

const processedPatientSchema = new mongoose.Schema({
  patientId: String,
  processed: { type: Boolean, default: false },
  processedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ProcessedPatient || mongoose.model('ProcessedPatient', processedPatientSchema);
