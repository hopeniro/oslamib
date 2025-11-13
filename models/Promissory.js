const mongoose = require('mongoose');

const promissorySchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  transactionIds: [{ type: String, required: true }],
  admissionNumber: String, // Ties this promissory to a specific admission (1 promissory = 1 admission)
  dateIssued: { type: Date, default: Date.now },
  dateApproved: Date,
  approvedBy: String,
  paymentExpected: Date,
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Settled', 'Overdue'],
    default: 'Pending'
  },
  amount: { type: Number, required: true }, // Amount hospital will cover
  notes: String,
  imagePath: String, // Optional - path to uploaded promissory image
  // Optional audit fields
  dateRejected: Date,
  rejectedBy: String,
  rejectionReason: String,
  // Settlement fields (set when payment is verified for the admission)
  settledAt: Date
});

module.exports = mongoose.models.Promissory || mongoose.model('Promissory', promissorySchema);
