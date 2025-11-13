const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
    doctorId: {
        type: String,
        required: [true, 'Doctor ID is required'],
        unique: true,
        trim: true
      },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  middleName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  birthday: {
    type: Date,
    required: [true, 'Birthday is required']
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['Male', 'Female', 'Other']
  },
  specialties: [{
    type: String,
    trim: true
  }],
  services: [{
    type: String,
    trim: true
  }],
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/\S+@\S+\.\S+/, 'Invalid email address']
  },
  contact: {
    type: String,
    trim: true,
    match: [/^\d{11}$/, 'Invalid contact number'] // enforce exactly 11 digits
  },
  licenseNumber: {
    type: String,
    trim: true
  },
  validUntil: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
  
});

module.exports = mongoose.models.Doctor || mongoose.model('Doctor', DoctorSchema);

