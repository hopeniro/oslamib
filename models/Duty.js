const mongoose = require('mongoose');

const dutySchema = new mongoose.Schema({
  duty: { type: String, required: true }
});

module.exports = mongoose.model('Duty', dutySchema);
