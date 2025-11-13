const mongoose = require('mongoose');

const departmentTransactionSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DepartmentCategory',
    required: true
  },
  transactions: [
    {
      transactionTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TransactionType'
      },
      type: {
        type: String
      }
    }
  ]
}, { versionKey: false });

module.exports = mongoose.model('DepartmentTransaction', departmentTransactionSchema);
