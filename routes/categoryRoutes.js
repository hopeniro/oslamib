const express = require('express');
const router = express.Router();
const DepartmentCategory = require('../models/DepartmentCategory');
const TransactionType = require('../models/TransactionType');
const DepartmentTransaction = require('../models/DepartmentTransaction');

router.get('/category', async (req, res) => {
  const categories = await DepartmentCategory.find().sort({ departmentId: 1 });
  const transactionTypes = await TransactionType.find(); // ✅ add this
  res.render('category', { categories, transactionTypes }); // ✅ pass both
});


// POST form
router.post('/category', async (req, res) => {
  const { name } = req.body;
  const exists = await DepartmentCategory.findOne({ name });

  if (!exists) {
    const newCategory = new DepartmentCategory({ name });
    await newCategory.save();
  }

  res.redirect('/category');
});

// GET form
router.get('/department-transactions', async (req, res) => {
  const categories = await DepartmentCategory.find();
  const transactionTypes = await TransactionType.find();
  res.render('departmentTransaction', { categories, transactionTypes });
});

// POST form
router.post('/department-transactions', async (req, res) => {
  const { categoryId, transactionTypeIds } = req.body;

  // Normalize checkbox to array
  const ids = Array.isArray(transactionTypeIds) ? transactionTypeIds : [transactionTypeIds];

  // Find types to get their names
  const transactionTypes = await TransactionType.find({ _id: { $in: ids } });

  const transactions = transactionTypes.map(tx => ({
    transactionTypeId: tx._id,
    type: tx.type
  }));

  await DepartmentTransaction.create({
    categoryId,
    transactions
  });

  res.redirect('/category');
});

module.exports = router;
