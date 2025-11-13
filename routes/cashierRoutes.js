const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Patient = require('../models/patient');
const Admission = require('../models/Admission');
const Promissory = require('../models/Promissory');
const Payment = require('../models/Payment');
const CashierPayment = require('../models/CashierPayment');
const Receipt = require('../models/Receipt');

// GET /cashier - Show all patients with "Billing Confirmed" transactions
router.get('/cashier', async (req, res) => {
  try {
    // Find all transactions with status "Billing Confirmed"
    const confirmedTransactions = await Transaction.find({ status: 'Billing Confirmed' }).distinct('patientId');

    // Populate patient details
    const patientsWithConfirmedBilling = [];
    for (const patientId of confirmedTransactions) {
      const patient = await Patient.findById(patientId);
      
      if (patient) {
        patientsWithConfirmedBilling.push({
          patientId: patient._id,
          hrn: patient.patientId,
          fullName: `${patient.firstName} ${patient.middleInitial || ''} ${patient.lastName}`.trim(),
          birthday: patient.birthDate
        });
      }
    }

    // Get all CashierPayment records for display
    const cashierPayments = await CashierPayment.find()
      .populate('patientId', 'firstName lastName patientId tempId')
      .sort({ createdAt: -1 })
      .limit(50); // Show last 50 payments

    // Get all pending Payment records for cashier to process
    const pendingPayments = await Payment.find({ status: 'Pending' })
      .populate('patientId', 'firstName lastName patientId tempId birthDate')
      .sort({ createdAt: -1 })
      .limit(50);

    res.render('cashier', { patients: patientsWithConfirmedBilling, cashierPayments: cashierPayments, pendingPayments });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading cashier');
  }
});

// GET /cashier/processed - Show all processed payments
router.get('/cashier/processed', async (req, res) => {
  try {
    // Get all CashierPayment records
    const cashierPayments = await CashierPayment.find()
      .populate('patientId', 'firstName lastName patientId tempId')
      .sort({ createdAt: -1 })
      .limit(100); // Show last 100 payments

    res.render('processedPayments', { cashierPayments });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading processed payments');
  }
});

// GET /cashier/invoice/:patientId - Generate invoice for cashier to process payment
router.get('/cashier/invoice/:patientId', async (req, res) => {
  const { patientId } = req.params;

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Find admission record for this patient
    const admission = await Admission.findOne({ patientId: patient.patientId }).sort({ dateAdmitted: -1 });

    // Get all transactions with "Billing Confirmed" status for this patient
    const transactions = await Transaction.find({ 
      patientId, 
      status: 'Billing Confirmed' 
    }).sort({ createdAt: 1 });

    if (transactions.length === 0) {
      return res.status(404).send('No confirmed billing transactions found for this patient');
    }

    // Get the saved Payment record
    const transactionIds = transactions.map(tx => tx.transactionId);
    const payment = await Payment.findOne({ 
      patientId,
      transactionIds: { $in: transactionIds },
      status: 'Pending'
    }).sort({ createdAt: -1 });

    // Build services list with reference numbers
    const servicesList = [];
    let refCounter = 1;
    
    transactions.forEach(tx => {
      tx.services.forEach(service => {
        const qty = service.qty || 1;
        const totalAmount = service.amount || 0;
        const unitPrice = qty > 0 ? totalAmount / qty : totalAmount;
        
        servicesList.push({
          ref: refCounter++,
          transactionType: service.type,
          description: service.description,
          qty: qty,
          unitPrice: unitPrice,
          amount: totalAmount
        });
      });
    });

    // Use saved payment data or calculate fallback
    const subtotal = payment ? payment.subtotal : servicesList.reduce((sum, s) => sum + s.amount, 0);
    const discountTypes = payment ? payment.discountTypes : [];
    const discountRate = payment ? payment.discountRate : 0;
    const discountAmount = payment ? payment.discountAmount : 0;
    const promissoryAmount = payment ? payment.promissoryAmount : 0;
    const finalTotal = payment ? payment.finalTotal : subtotal;

    // Calculate age from birthDate
    const today = new Date();
    const birthDate = new Date(patient.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Generate bill number (you can customize this)
    const billNumber = payment ? payment.billNumber : `${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;

    // Generate OR Number for the receipt
    const orNumber = await Receipt.generateORNumber();

    res.render('cashierReceipt', {
      patient,
      admission,
      services: servicesList,
      subtotal,
      discountTypes,
      discountRate,
      discountAmount,
      promissoryAmount,
      finalTotal,
      age,
      billNumber,
      orNumber,
      processedBy: req.session && req.session.user ? req.session.user.username : 'Cashier',
      currentDate: new Date(),
      transactionIds: transactionIds,
      paymentId: payment ? payment._id : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating invoice');
  }
});

// POST /cashier/verify-payment - Update transaction status to "Payment Verified" and mark payment as paid
router.post('/cashier/verify-payment', async (req, res) => {
  const { 
    transactionIds, 
    paymentId, 
    processedBy, 
    amountReceived, 
    changeGiven, 
    orNumber,
    services,
    patientHRN,
    patientName,
    billNumber,
    subtotal,
    discountTypes,
    discountRate,
    discountAmount,
    promissoryAmount,
    finalTotal,
    admissionNumber
  } = req.body;

  try {
    if (!transactionIds || transactionIds.length === 0) {
      return res.status(400).json({ error: 'No transactions provided' });
    }

    if (!amountReceived || !changeGiven === undefined || !orNumber) {
      return res.status(400).json({ error: 'Missing receipt information' });
    }

    // Update all transactions to "Payment Verified"
    await Transaction.updateMany(
      { transactionId: { $in: transactionIds } },
      { $set: { status: 'Payment Verified' } }
    );

    let cashierPaymentId = null;

    // Update Payment record to "Paid" status and create CashierPayment record
    if (paymentId) {
      // Fetch payment first to ensure we have snapshot fields
      const paymentDoc = await Payment.findById(paymentId);
      if (paymentDoc) {
        paymentDoc.status = 'Paid';
        paymentDoc.paymentDate = new Date();
        paymentDoc.processedBy = processedBy || 'Cashier';
        await paymentDoc.save();

        // If a promissory was used for this payment, mark it as settled so it won't apply to future admissions
        if (paymentDoc.promissoryId) {
          try {
            await Promissory.findByIdAndUpdate(paymentDoc.promissoryId, {
              $set: {
                status: 'Settled',
                settledAt: new Date()
              }
            });
          } catch (e) {
            console.warn('Failed to settle promissory:', e && e.message ? e.message : e);
          }
        }

        const cashierPayment = new CashierPayment({
          paymentId: paymentDoc._id,
          patientId: paymentDoc.patientId,
          transactionIds: paymentDoc.transactionIds,
          subtotal: paymentDoc.subtotal || 0,
          discountTypes: paymentDoc.discountTypes || [],
          discountRate: paymentDoc.discountRate || 0,
          discountAmount: paymentDoc.discountAmount || 0,
          promissoryAmount: paymentDoc.promissoryAmount || 0,
          finalTotal: paymentDoc.finalTotal || 0,
          billNumber: paymentDoc.billNumber,
          paymentDate: new Date(),
          processedBy: processedBy || 'Cashier',
          patientName: paymentDoc.patientName,
          patientHRN: paymentDoc.patientHRN,
          paymentMethod: 'Cash'
        });
        await cashierPayment.save();
        cashierPaymentId = cashierPayment._id;

        // Create Receipt record
        const receipt = new Receipt({
          orNumber: orNumber,
          paymentId: paymentDoc._id,
          cashierPaymentId: cashierPaymentId,
          patientId: paymentDoc.patientId,
          patientHRN: patientHRN,
          patientName: patientName,
          transactionIds: transactionIds,
          billNumber: billNumber,
          services: services || [],
          subtotal: subtotal || 0,
          discountTypes: discountTypes || [],
          discountRate: discountRate || 0,
          discountAmount: discountAmount || 0,
          promissoryAmount: promissoryAmount || 0,
          finalTotal: finalTotal || 0,
          amountReceived: amountReceived,
          changeGiven: changeGiven,
          processedBy: processedBy || 'Cashier',
          receiptDate: new Date(),
          admissionNumber: admissionNumber
        });
        await receipt.save();
      }
    }

    res.json({ success: true, message: 'Payment verified and receipt generated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error verifying payment' });
  }
});

module.exports = router;
