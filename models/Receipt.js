const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  orNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Link to Payment and CashierPayment
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  cashierPaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CashierPayment',
    required: true
  },
  
  // Patient information
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  patientHRN: {
    type: String,
    required: true
  },
  patientName: {
    type: String,
    required: true
  },
  
  // Transaction details
  transactionIds: {
    type: [String],
    required: true
  },
  billNumber: {
    type: String,
    required: true
  },
  
  // Financial breakdown
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
  
  // Payment details
  amountReceived: {
    type: Number,
    required: true
  },
  changeGiven: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Cashier and timestamp
  processedBy: {
    type: String,
    required: true,
    default: 'Cashier'
  },
  receiptDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Services snapshot for receipt
  services: [{
    ref: Number,
    transactionType: String,
    description: String,
    qty: Number,
    unitPrice: Number,
    amount: Number
  }],
  
  // Admission info
  admissionNumber: {
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
receiptSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to generate next OR number
receiptSchema.statics.generateORNumber = async function() {
  const currentYear = new Date().getFullYear();
  const prefix = `OR-${currentYear}-`;
  
  // Find the last receipt for this year
  const lastReceipt = await this.findOne({
    orNumber: new RegExp(`^${prefix}`)
  }).sort({ orNumber: -1 });
  
  let nextNumber = 1;
  if (lastReceipt) {
    // Extract the number part and increment
    const lastNumber = parseInt(lastReceipt.orNumber.split('-').pop());
    nextNumber = lastNumber + 1;
  }
  
  // Format: OR-2025-00001
  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
};

module.exports = mongoose.model('Receipt', receiptSchema);
