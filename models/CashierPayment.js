const mongoose = require('mongoose');

const cashierPaymentSchema = new mongoose.Schema({
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  transactionIds: {
    type: [String],
    required: true
  },
  
  // Financial details (copied from Payment for quick access)
  subtotal: {
    type: Number,
    required: true
  },
  discountTypes: {
    type: [String],
    default: []
  },
  discountRate: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  promissoryAmount: {
    type: Number,
    default: 0
  },
  finalTotal: {
    type: Number,
    required: true
  },
  
  // Cashier-specific fields
  billNumber: {
    type: String,
    required: true
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  processedBy: {
    type: String,
    required: true,
    default: 'Cashier'
  },
  
  // Patient snapshot (for historical records)
  patientName: {
    type: String,
    required: true
  },
  patientHRN: {
    type: String,
    required: true
  },
  
  // Payment method (optional)
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Credit Card', 'Debit Card', 'Check', 'Online Transfer', 'Other'],
    default: 'Cash'
  },
  
  // Reference number for non-cash payments
  referenceNumber: {
    type: String,
    default: null
  },
  
  // Amount received and change
  amountReceived: {
    type: Number,
    default: null
  },
  changeGiven: {
    type: Number,
    default: null
  },
  
  // Notes
  notes: {
    type: String,
    default: null
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
cashierPaymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('CashierPayment', cashierPaymentSchema);
