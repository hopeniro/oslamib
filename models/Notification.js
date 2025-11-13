const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  patientId: String,
  fullName: String,
  message: String,
  department: String,  // 'Admission', 'Emergency', 'OPD'
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
