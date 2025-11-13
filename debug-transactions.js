const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const Admission = require('./models/Admission');

mongoose.connect('mongodb://localhost:27017/oslam').then(async () => {
  console.log('=== TRANSACTION DEBUG ===\n');
  
  const totalTxs = await Transaction.countDocuments();
  const withAdmissionId = await Transaction.countDocuments({admissionId: {$exists: true, $ne: null}});
  const withoutAdmissionId = await Transaction.countDocuments({admissionId: {$exists: false}});
  const withNullAdmissionId = await Transaction.countDocuments({admissionId: null});
  
  console.log('Total transactions:', totalTxs);
  console.log('With admissionId:', withAdmissionId);
  console.log('Without admissionId field:', withoutAdmissionId);
  console.log('With null admissionId:', withNullAdmissionId);
  
  console.log('\n=== ACTIVE ADMISSIONS ===\n');
  const activeAdmissions = await Admission.find({ discharged: { $ne: true } });
  console.log('Active admissions count:', activeAdmissions.length);
  console.log('Active admission IDs:', activeAdmissions.map(a => a.admittingId));
  
  console.log('\n=== SAMPLE TRANSACTIONS ===\n');
  const sampleTxs = await Transaction.find().limit(5).lean();
  sampleTxs.forEach(tx => {
    console.log(`TX ${tx.transactionId}: admissionId="${tx.admissionId}", status="${tx.status}"`);
  });
  
  console.log('\n=== UNPAID TRANSACTIONS ===\n');
  const unpaidTxs = await Transaction.find({status: {$ne: 'Payment Verified'}}).lean();
  console.log('Unpaid transactions:', unpaidTxs.length);
  unpaidTxs.forEach(tx => {
    console.log(`TX ${tx.transactionId}: admissionId="${tx.admissionId}", status="${tx.status}"`);
  });
  
  process.exit();
});
