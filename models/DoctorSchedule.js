const mongoose = require('mongoose');

const doctorScheduleSchema = new mongoose.Schema({
  doctorId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true },   // HH:MM
  department: { type: String, enum: ['OPD', 'Emergency'], required: true },
  specialties: { type: [String], default: [] },
  services: { type: [String], default: [] }
});

module.exports = mongoose.model('DoctorSchedule', doctorScheduleSchema);
