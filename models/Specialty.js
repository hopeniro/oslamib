const mongoose = require('mongoose');

const SpecialtySchema = new mongoose.Schema({
  specialty: { type: String, required: true }
});

module.exports = mongoose.model('Specialty', SpecialtySchema);
