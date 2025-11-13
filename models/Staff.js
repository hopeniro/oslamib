const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  staffId: {
    type: String,
    unique: true,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  middleName: {
    type: String,
    default: ''
  },
  lastName: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female']
  },
  civilStatus: {
    type: String,
    required: true,
    enum: ['Single', 'Married', 'Widowed', 'Divorced', 'Separated']
  },
  nationality: {
    type: String,
    required: true
  },
  contactNumber: {
    type: String,
    required: true
  },
  emailAddress: {
    type: String,
    required: true
  },
  homeAddress: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['Triage', 'Admission', 'Out Patient Department', 'Emergency Department', 'Billing', 'Cashier', 'Admin', ''],
    default: ''
  },
  username: {
    type: String,
    default: ''
  },
  password: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'inactive'
  }
}, {
  timestamps: true
});

// Generate staff ID in format STF-250001
staffSchema.statics.generateStaffId = async function() {
  const lastStaff = await this.findOne().sort({ staffId: -1 });
  if (!lastStaff) {
    return 'STF-250001';
  }
  
  const lastIdNumber = parseInt(lastStaff.staffId.split('-')[1]);
  const newIdNumber = lastIdNumber + 1;
  return `STF-${newIdNumber.toString().padStart(6, '0')}`;
};

module.exports = mongoose.model('Staff', staffSchema);
