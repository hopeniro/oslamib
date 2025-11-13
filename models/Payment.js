const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  transactionIds: [{ type: String, required: true }],
  // Admission scope for this payment
  admissionNumber: { type: String },
  
  // Financial breakdown
  subtotal: { type: Number, required: true },
  discountTypes: [{ type: String }], // ['Senior Citizen', 'PWD', 'Resident Citizen']
  discountRate: { type: Number, default: 0 }, // e.g., 0.30 (30%)
  discountAmount: { type: Number, default: 0 },
  promissoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promissory' },
  promissoryAmount: { type: Number, default: 0 },
  finalTotal: { type: Number, required: true },
  
  // Payment metadata
  billNumber: { type: String, required: true },
  paymentDate: { type: Date },
  processedBy: { type: String }, // Cashier name/ID
  status: { 
    type: String, 
    enum: ['Pending', 'Paid', 'Partially Paid', 'Cancelled'],
    default: 'Pending'
  },
  
  // Patient info snapshot (for historical records)
  patientName: { type: String },
  patientHRN: { type: String },
  
  // Audit
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt timestamp before saving
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
