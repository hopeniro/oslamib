const mongoose = require('mongoose');

const nurseSchema = new mongoose.Schema({
  nurseId: String,
  firstName: String,
  middleInitial: String,
  lastName: String,
  birthday: Date,
  gender: String,
  contact: String,
  address: String,
  email: String,
  departments: [String],
  duties: [String],
  licenseNumber: String,
  validUntil: Date,
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
});

module.exports = mongoose.model('Nurse', nurseSchema);
