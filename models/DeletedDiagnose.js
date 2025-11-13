const mongoose = require('mongoose');

const deletedDiagnoseSchema = new mongoose.Schema({
  originalMedicalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medical',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  department: {
    type: String,
    enum: ['OPD', 'Emergency'],
    required: true
  },
  diagnose: {
    date: {
      type: Date,
      required: true
    },
    complaint: {
      type: String,
      required: true
    },
    doctor_order: {
      type: String,
      required: true
    },
    nurse_assist: {
      type: String,
      required: true
    },
    doctor: {
      type: String,
      required: true
    }
  },
  deleteReason: {
    type: String,
    enum: ['Wrong entry', 'Change of mind'],
    required: true
  },
  deletedAt: {
    type: Date,
    default: Date.now
  },
  deletedBy: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('DeletedDiagnose', deletedDiagnoseSchema);
