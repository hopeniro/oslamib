const mongoose = require('mongoose');

const DoctorServiceSchema = new mongoose.Schema({
  service: { type: String, required: true }
});

module.exports = mongoose.model('DoctorService', DoctorServiceSchema);
