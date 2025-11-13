// models/NurseSchedule.js
const mongoose = require('mongoose');

const nurseScheduleSchema = new mongoose.Schema({
  nurseId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true },   // HH:MM
  department: { type: String, enum: ['OPD', 'Emergency'], required: true }
});

module.exports = mongoose.model('NurseSchedule', nurseScheduleSchema);
