const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Patient = require('../models/patient');
const Admission = require('../models/Admission');
const Notification = require('../models/Notification');
const Promissory = require('../models/Promissory');
const Payment = require('../models/Payment');
const mongoose = require('mongoose');

// GET /billing - Show all patients with pending transactions
router.get('/billing', async (req, res) => {
  try {
    // Aggregate transactions by patientId, excluding "Payment Verified" status
    const billingData = await Transaction.aggregate([
      {
        $match: {
          status: { $ne: 'Payment Verified' } // Exclude transactions that have been paid
        }
      },
      {
        $group: {
          _id: '$patientId',
          transactionCount: { $sum: 1 },
          totalAmount: {
            $sum: {
              $reduce: {
                input: '$services',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.amount'] }
              }
            }
          },
          latestDate: { $max: '$createdAt' }
        }
      },
      { $sort: { latestDate: -1 } }
    ]);

    // Populate patient details
    const patientsWithBilling = [];
    for (const billing of billingData) {
      const patient = await Patient.findById(billing._id);
      
      if (patient) {
        // Get the latest promissory for this patient (regardless of paid status)
        const promissory = await Promissory.findOne({ 
          patientId: patient.patientId || patient.tempId,
          status: { $in: ['Pending', 'Approved', 'Rejected', 'Settled'] }
        }).sort({ dateIssued: -1 });

        // Compute covered amount (promissory amount) if promissory is approved
        let covered = null;
        let rejectionReason = null;
        if (promissory && promissory.status === 'Approved') {
          covered = promissory.amount || 0;
        }
        if (promissory && promissory.status === 'Rejected') {
          rejectionReason = promissory.rejectionReason || 'No reason provided';
        }
        
        patientsWithBilling.push({
          patientId: billing._id,
          hrn: patient.patientId,
          fullName: `${patient.firstName} ${patient.middleInitial || ''} ${patient.lastName}`.trim(),
          birthday: patient.birthDate,
          transactionCount: billing.transactionCount,
          totalAmount: billing.totalAmount,
          latestDate: billing.latestDate,
          promissoryStatus: promissory ? promissory.status : null,
          covered,
          rejectionReason,
          promissoryImage: promissory && promissory.imagePath ? promissory.imagePath : null
        });
      }
    }

    // Get all Payment records for display
    const payments = await Payment.find()
      .populate('patientId', 'firstName lastName patientId tempId')
      .sort({ createdAt: -1 })
      .limit(50); // Show last 50 payments

    res.render('billing', { patients: patientsWithBilling, payments: payments });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading billing');
  }
});

// GET /billing/view/:patientId - Show detailed transactions for a patient
router.get('/billing/view/:patientId', async (req, res) => {
  const { patientId } = req.params;

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Only fetch transactions that haven't been paid yet
    const transactions = await Transaction.find({ 
      patientId,
      status: { $ne: 'Payment Verified' }
    }).sort({ createdAt: -1 });

    // Calculate grand total
    let grandTotal = 0;
    transactions.forEach(tx => {
      tx.services.forEach(service => {
        grandTotal += service.amount || 0;
      });
    });

    res.render('billingDetails', { patient, transactions, grandTotal });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading transaction details');
  }
});

// GET /billing/print/:patientId - Generate printable invoice
router.get('/billing/print/:patientId', async (req, res) => {
  const { patientId } = req.params;

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Find admission record for this patient
    const admission = await Admission.findOne({ 
      patientId: patient.patientId || patient.tempId 
    }).sort({ dateAdmitted: -1 });

    // Get all transactions for this patient that haven't been paid yet
    const transactions = await Transaction.find({ 
      patientId,
      status: { $ne: 'Payment Verified' }
    }).sort({ createdAt: 1 });

    // Build services list with reference numbers
    const servicesList = [];
    let refCounter = 1;
    const transactionIds = [];
    
    transactions.forEach(tx => {
      transactionIds.push(tx.transactionId);
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

    // Calculate totals
    const subtotal = servicesList.reduce((sum, s) => sum + s.amount, 0);

    // Get approved promissory for this patient's current admission (1 promissory = 1 admission)
    const promissory = await Promissory.findOne({ 
      patientId: patient.patientId || patient.tempId,
      status: 'Approved',
      admissionNumber: admission ? admission.admissionNumber : null
    }).sort({ dateApproved: -1 });

    const promissoryAmount = promissory ? promissory.amount : 0;
    console.log('Patient HRN:', patient.patientId || patient.tempId, 'Admission:', admission ? admission.admissionNumber : 'N/A', 'Promissory:', promissory, 'Amount:', promissoryAmount);

    // Calculate age from birthDate
    const today = new Date();
    const birthDate = new Date(patient.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Generate bill number (you can customize this)
    const billNumber = `${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;

    // Check if there is an existing pending Payment for this patient for any of these transactions
    let hasPendingPayment = false;
    try {
      const existingPayment = await Payment.findOne({
        patientId: patient._id,
        status: 'Pending',
        transactionIds: { $in: transactionIds }
      }).sort({ createdAt: -1 });
      hasPendingPayment = !!existingPayment;
    } catch (e) {
      console.warn('Error checking existing payment:', e && e.message ? e.message : e);
    }

    res.render('billingInvoice', {
      patient,
      admission,
      services: servicesList,
      subtotal,
      age,
      billNumber,
      currentDate: new Date(),
      transactionIds: transactionIds,
      promissoryAmount: promissoryAmount,
      hasPendingPayment
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating invoice');
  }
});

// POST /billing/confirm - Update transaction status to "Billing Confirmed" and create Payment record
router.post('/billing/confirm', async (req, res) => {
  const { transactionIds, subtotal, discountTypes, discountRate, discountAmount, promissoryAmount, finalTotal, billNumber } = req.body;

  try {
    if (!transactionIds || transactionIds.length === 0) {
      return res.status(400).json({ error: 'No transactions provided' });
    }

    // Update all transactions to "Billing Confirmed"
    await Transaction.updateMany(
      { transactionId: { $in: transactionIds } },
      { $set: { status: 'Billing Confirmed' } }
    );

    // Get patient info from the first transaction
    const firstTransaction = await Transaction.findOne({ transactionId: transactionIds[0] });
    if (firstTransaction) {
      const patient = await Patient.findById(firstTransaction.patientId);
      if (patient) {
        const hrn = patient.patientId || patient.tempId;
        const fullName = `${patient.lastName}, ${patient.firstName}`.trim();
        // Find current admission to scope promissory and persist to payment
        const admission = await Admission.findOne({ patientId: hrn }).sort({ dateAdmitted: -1 });
        
        // Get approved promissory for this admission if exists
        const promissory = await Promissory.findOne({ 
          patientId: hrn,
          status: 'Approved',
          admissionNumber: admission ? admission.admissionNumber : null
        }).sort({ dateApproved: -1 });

        // Create Payment record
        const payment = new Payment({
          patientId: firstTransaction.patientId,
          transactionIds,
          admissionNumber: admission ? admission.admissionNumber : null,
          subtotal: parseFloat(subtotal) || 0,
          discountTypes: discountTypes || [],
          discountRate: parseFloat(discountRate) || 0,
          discountAmount: parseFloat(discountAmount) || 0,
          promissoryId: promissory ? promissory._id : null,
          promissoryAmount: parseFloat(promissoryAmount) || 0,
          finalTotal: parseFloat(finalTotal) || 0,
          billNumber: billNumber || `BILL-${Date.now()}`,
          patientName: fullName,
          patientHRN: hrn,
          status: 'Pending'
        });
        await payment.save();
        
        // Create notification for cashier with full context (HRN, name, and phrase)
        const notification = new Notification({
          patientId: hrn,
          fullName: fullName,
          message: `Patient HRN ${hrn} ${fullName} for Payments`,
          department: 'Cashier',
          read: false
        });
        await notification.save();

        // Emit socket notification
        const io = req.app.get('io');
        if (io) {
          io.emit('newNotification', notification);
        }
      }
    }

    res.json({ success: true, message: 'Transactions confirmed for billing' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error confirming transactions' });
  }
});

// POST /billing/cancel-confirm - Revert transaction status back to "For Billing"
router.post('/billing/cancel-confirm', async (req, res) => {
  const { transactionIds } = req.body;

  try {
    if (!transactionIds || transactionIds.length === 0) {
      return res.status(400).json({ error: 'No transactions provided' });
    }

    // Check if any transaction has been paid (Payment Verified status)
    const verifiedTransactions = await Transaction.find({
      transactionId: { $in: transactionIds },
      status: 'Payment Verified'
    });

    if (verifiedTransactions.length > 0) {
      return res.status(403).json({ 
        error: 'Cannot cancel: Payment has already been verified by cashier. Please contact cashier department.' 
      });
    }

    // Get the first transaction to find patientId
    const firstTransaction = await Transaction.findOne({ transactionId: transactionIds[0] });
    
    if (firstTransaction) {
      const patient = await Patient.findById(firstTransaction.patientId);
      if (patient) {
        const hrn = patient.patientId || patient.tempId;
        
        // Delete the Payment record for these transactions
        await Payment.deleteMany({
          patientId: firstTransaction.patientId,
          transactionIds: { $in: transactionIds },
          status: 'Pending'
        });

        // Delete the Cashier notification for this patient
        await Notification.deleteMany({
          patientId: hrn,
          department: 'Cashier',
          read: false
        });

        // Emit socket event to update cashier UI
        const io = req.app.get('io');
        if (io) {
          io.emit('paymentCancelled', { patientId: hrn });
        }
      }
    }

    // Update all transactions back to "For Billing" (only those with "Billing Confirmed")
    await Transaction.updateMany(
      { transactionId: { $in: transactionIds }, status: 'Billing Confirmed' },
      { $set: { status: 'For Billing' } }
    );

    res.json({ success: true, message: 'Transactions reverted to For Billing' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error cancelling confirmation' });
  }
});

// GET /billing/payments - Show all saved payment records
router.get('/billing/payments', async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('patientId', 'firstName lastName patientId tempId birthDate')
      .sort({ createdAt: -1 });

    // Format payments for display
    const formattedPayments = payments.map(payment => {
      const patient = payment.patientId;
      return {
        _id: payment._id,
        patientHRN: payment.patientHRN || (patient ? patient.patientId || patient.tempId : 'N/A'),
        patientName: payment.patientName || (patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'),
        admissionNumber: payment.admissionNumber || null,
        billNumber: payment.billNumber,
        subtotal: payment.subtotal,
        discountTypes: payment.discountTypes,
        discountAmount: payment.discountAmount,
        promissoryAmount: payment.promissoryAmount,
        finalTotal: payment.finalTotal,
        status: payment.status,
        paymentDate: payment.paymentDate,
        processedBy: payment.processedBy,
        createdAt: payment.createdAt
      };
    });

    res.render('billingPayments', { payments: formattedPayments });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading payment records');
  }
});

// GET /billing/payments/invoice/:paymentId - View saved payment invoice
router.get('/billing/payments/invoice/:paymentId', async (req, res) => {
  const { paymentId } = req.params;

  try {
    const payment = await Payment.findById(paymentId).populate('patientId');
    if (!payment) {
      return res.status(404).send('Payment record not found');
    }

    const patient = payment.patientId;
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Find admission record
    const admission = await Admission.findOne({ 
      patientId: patient.patientId || patient.tempId 
    }).sort({ dateAdmitted: -1 });

    // Get transactions for this payment
    const transactions = await Transaction.find({ 
      transactionId: { $in: payment.transactionIds } 
    }).sort({ createdAt: 1 });

    // Build services list
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

    // Calculate age
    const today = new Date();
    const birthDate = new Date(patient.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    res.render('cashierInvoice', {
      patient,
      admission,
      services: servicesList,
      subtotal: payment.subtotal,
      discountTypes: payment.discountTypes,
      discountRate: payment.discountRate,
      discountAmount: payment.discountAmount,
      promissoryAmount: payment.promissoryAmount,
      finalTotal: payment.finalTotal,
      age,
      billNumber: payment.billNumber,
      currentDate: payment.createdAt,
      transactionIds: payment.transactionIds,
      paymentId: payment._id,
      readOnly: true // Flag to disable editing
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading payment invoice');
  }
});

module.exports = router;
