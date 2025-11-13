const mongoose = require('mongoose');

const onHoldSchema = new mongoose.Schema({
  tempId: String,
  patientId: { type: String, default: '' },
  registeredPatientId: String,
  onHoldStatus: [String],
  estimateAge: String,
  clothes: String,
  dateTimeFound: String,
  locationFound: String,
  status: [String]
});

// Prevent OverwriteModelError
module.exports = mongoose.models.OnHold || mongoose.model('OnHold', onHoldSchema);
