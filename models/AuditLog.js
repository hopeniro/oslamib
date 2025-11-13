const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: String,
  action: { type: String, required: true }, // e.g., create, update, delete, login, discharge, payment
  recordType: { type: String, required: true }, // e.g., Patient, Payment, Admission
  recordId: { type: String },
  timestamp: { type: Date, default: Date.now },
  before: mongoose.Schema.Types.Mixed, // previous state
  after: mongoose.Schema.Types.Mixed, // new state
  details: mongoose.Schema.Types.Mixed // extra info
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
