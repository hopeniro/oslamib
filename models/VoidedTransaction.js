const mongoose = require('mongoose');

const voidedTransactionSchema = new mongoose.Schema({
  originalTransactionId: {
    type: String,
    required: true
  },
  admissionId: String,
  patientId: {
    type: String,
    required: true
  },
  department: {
    type: String,
    enum: ['OPD', 'Emergency'],
    required: true
  },
  service: {
    serviceType: String,
    description: String,
    procedureAmount: Number,
    itemUsed: String,
    itemAmount: Number,
    qty: { type: Number, default: 1 },
    amount: Number
  },
  voidReason: {
    type: String,
    enum: ['Wrong punch', 'Change of mind'],
    required: true
  },
  voidedAt: {
    type: Date,
    default: Date.now
  },
  voidedBy: String
}, { versionKey: false, timestamps: true });

module.exports = mongoose.model('VoidedTransaction', voidedTransactionSchema);
