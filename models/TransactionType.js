// models/TransactionType.js
const mongoose = require('mongoose');

const transactionTypeSchema = new mongoose.Schema({
  type: String,
  services: [
    {
      description: String,
      procedureAmount: Number,
      itemUsed: String,
      itemAmount: Number,
      amount: Number
    }
  ]
});

module.exports = mongoose.model('TransactionType', transactionTypeSchema);
