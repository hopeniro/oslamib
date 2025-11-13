const express = require('express');
const router = express.Router();
const Admission = require('../models/Admission');
const Medical = require('../models/Medical');
const Patient = require('../models/patient');
const DoctorSchedule = require('../models/DoctorSchedule');
const NurseSchedule = require('../models/NurseSchedule');
const Doctor = require('../models/Doctor');
const Nurse = require('../models/Nurse');
const DepartmentTransaction = require('../models/DepartmentTransaction');
const DepartmentCategory = require('../models/DepartmentCategory');
const Transaction = require('../models/Transaction'); // defined below
const { v4: uuidv4 } = require('uuid');
const TransactionType = require('../models/TransactionType');
const DeletedDiagnose = require('../models/DeletedDiagnose');

router.get('/emergency', async (req, res) => {
  try {
    const patients = await Admission.find({
      category: { $regex: /^Emergency$/i }
    }).sort({ admittedAt: -1 });
    res.render('emergency', { patients });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/emergency/view/:id', async (req, res) => {
  const id = req.params.id;
  try {
    // Find patient by patientId
    const patient = await Patient.findOne({ patientId: id });

    // If not found
    if (!patient) {
      return res.status(404).send('Patient Medical is Update');
    }

    // Get admission info for charge slip button
    const admissionInfo = await Admission.findOne({ patientId: id });

    // Get medical records
    const medicalRecords = await Medical.find({ patientId: id });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; // YYYY-MM-DD (local)

const doctorSchedules = await DoctorSchedule.find({ date: todayStr, department: 'Emergency' });
const nurseSchedules = await NurseSchedule.find({ date: todayStr, department: 'Emergency' });

// Extract IDs
const doctorIds = doctorSchedules.map(d => d.doctorId);
const nurseIds = nurseSchedules.map(n => n.nurseId);

// Fetch full details
const allDoctors = await Doctor.find({ doctorId: { $in: doctorIds } });
const today = new Date();
const availableDoctors = allDoctors.filter(doc => {
  const isLicenseValid = !doc.validUntil || new Date(doc.validUntil) >= today;
  const isActive = (doc.status || 'active') === 'active';
  return isLicenseValid && isActive;
});

// Fetch nurses and filter by status and license validity
const allNurses = await Nurse.find({ nurseId: { $in: nurseIds } });
const availableNurses = allNurses.filter(nurse => {
  const isLicenseValid = !nurse.validUntil || new Date(nurse.validUntil) >= today;
  const isActive = nurse.status === 'active';
  return isLicenseValid && isActive;
});

    // Fetch charge slip transactions for this patient
    const transactions = await Transaction.find({ patientId: patient._id }).sort({ createdAt: -1 });

      // Determine if there is a diagnose after admission
      let hasRecentDiagnose = false;
      if (admissionInfo && medicalRecords.length > 0) {
        for (const record of medicalRecords) {
          if (Array.isArray(record.diagnose)) {
            if (record.diagnose.some(d => new Date(d.date) >= new Date(admissionInfo.admittedAt))) {
              hasRecentDiagnose = true;
              break;
            }
          }
        }
      }

      // Get category and transaction types for charge slip modal
      const category = await DepartmentCategory.findOne({ name: 'Emergency' });
      const transactionTypes = await TransactionType.find({});

      res.render('emergency_view_details', {
        patient,
        medicalRecords,
        availableDoctors,
        availableNurses,
        admissionInfo,
        transactions,
        hasRecentDiagnose,
        category,
        transactionTypes
      });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading patient data');
  }
});



router.post('/emergency/view/:id/diagnose', async (req, res) => {
  const { id: patientIdOrTempId } = req.params;
  const { medicalId, complaint, doctor_order, nurse_assist, doctor } = req.body;

  try {
    console.log(`📌 Diagnosing for ID: ${patientIdOrTempId}`);

    // Find patient - check if it's MongoDB ObjectId or patientId (HRN)
    let patient;
    if (patientIdOrTempId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      patient = await Patient.findById(patientIdOrTempId);
    } else {
      // It's a patientId (HRN)
      patient = await Patient.findOne({ patientId: patientIdOrTempId });
    }

    // Not found
    if (!patient) {
      console.error('❌ Patient not found with ID:', patientIdOrTempId);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }
      return res.status(404).send('Patient not found');
    }

    // Find medical record
    const medical = await Medical.findById(medicalId);
    if (!medical) {
      console.error('❌ Medical record not found for ID:', medicalId);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Medical record not found' });
      }
      return res.status(404).send('Medical record not found');
    }

    // Look up doctor
    const selectedDoctor = await Doctor.findOne({ doctorId: doctor });
    const doctorFullName = selectedDoctor
      ? `${selectedDoctor.firstName} ${selectedDoctor.middleName || ''} ${selectedDoctor.lastName}`.trim()
      : 'Unknown Doctor';

    // Look up nurse
    const selectedNurse = await Nurse.findOne({ nurseId: nurse_assist });
    const nurseFullName = selectedNurse
      ? `${selectedNurse.firstName} ${selectedNurse.middleInitial || ''} ${selectedNurse.lastName}`.trim()
      : 'Unknown Nurse';

    // Save diagnosis with automatic timestamp
    await Medical.findByIdAndUpdate(medicalId, {
      $push: {
        diagnose: {
          date: new Date(), // Automatic timestamp
          complaint,
          doctor_order,
          nurse_assist: nurseFullName,
          doctor: doctorFullName
        }
      }
    });

    console.log('✅ Diagnose saved successfully for:', patientIdOrTempId);
    
    // Check if request is AJAX
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Diagnose added successfully' });
    }
    
    res.redirect(`/emergency/view/${patientIdOrTempId}`);
  } catch (error) {
    console.error('❌ Diagnose Save Error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    res.status(500).send('Internal server error');
  }
});

// Charge slip form
router.get('/emergency/charge-slip/:admissionId/:patientId', async (req, res) => {
  const { admissionId, patientId } = req.params;

  try {
    // Get patient details - patientId could be ObjectId or the patient's patientId field
    let patient;
    if (patientId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid ObjectId
      patient = await Patient.findById(patientId);
    } else {
      // It's the patientId field (HRN like "25-00-00-14" or tempId like "25-00-00-09")
      patient = await Patient.findOne({ patientId: patientId });
    }

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Get the department (Emergency) category
    const category = await DepartmentCategory.findOne({ name: 'Emergency' });

    // Get all TransactionTypes with their services
    const transactionTypes = await TransactionType.find({});

    res.render('generateChargeSlip', {
      admissionId,
      patientId: patient._id,
      patient,
      category,
      transactionTypes
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading charge slip');
  }
});




router.post('/emergency/charge-slip', async (req, res) => {
  console.log('[DEBUG] Full req.body keys:', Object.keys(req.body));
  console.log('[DEBUG] req.body.services type:', typeof req.body.services);
  console.log('[DEBUG] req.body.transactionsJson type:', typeof req.body.transactionsJson);
  
  const { admissionId, patientId, categoryId } = req.body;
  let { transactions, transactionsJson } = req.body;

  // Prefer robust JSON payload if present
  let txArr = null;
  if (transactionsJson && typeof transactionsJson === 'string') {
    try { txArr = JSON.parse(transactionsJson); } catch (_) { txArr = null; }
  }
  // Fallbacks
  if (!txArr) {
    txArr = transactions;
    if (typeof txArr === 'string') {
      try { txArr = JSON.parse(txArr); } catch (_) { txArr = null; }
    }
  }
  // If still not array, normalize possible object with numeric keys or single object
  if (txArr && !Array.isArray(txArr)) {
    if (typeof txArr === 'object') {
      const keys = Object.keys(txArr);
      if (keys.every(k => /^\d+$/.test(k))) {
        txArr = keys.sort((a,b)=>a-b).map(k => txArr[k]);
      } else {
        txArr = [txArr];
      }
    }
  }
  if (!Array.isArray(txArr)) txArr = [];

  // Build services array from the submitted items
  const services = [];
  txArr.forEach(tx => {
    if (tx && typeof tx === 'object') {
      const type = tx.type;
      const description = tx.description;
      const amount = tx.amount;
      if (type && description && amount !== undefined && amount !== null) {
        services.push({
          type,
          description,
          procedureAmount: tx.procedureAmount !== '' && tx.procedureAmount != null ? Number(tx.procedureAmount) : null,
          itemUsed: tx.itemUsed || '',
          itemAmount: tx.itemAmount !== '' && tx.itemAmount != null ? Number(tx.itemAmount) : null,
          qty: tx.qty && !isNaN(tx.qty) ? Number(tx.qty) : 1,
          amount: Number(amount)
        });
      }
    }
  });

  const docToCreate = {
    transactionId: uuidv4().slice(0, 8).toUpperCase(),
    admissionId,
    patientId,
    categoryId,
    services
  };

  // Debug: verify payload shape
  console.log('[ChargeSlip] services type:', typeof services, 'isArray:', Array.isArray(services));
  console.log('[ChargeSlip] services[0] type:', typeof services[0]);
  console.log('[ChargeSlip] Creating Transaction:', JSON.stringify(docToCreate));

  // Server-side duplicate guard: if an identical payload was created very recently, skip creating again
  try {
    const normalize = (arr) => JSON.stringify((arr || []).map(s => ({
      t: s.type || '',
      d: s.description || '',
      pa: (s.procedureAmount === 0 || s.procedureAmount) ? Number(s.procedureAmount) : null,
      iu: s.itemUsed || '',
      ia: (s.itemAmount === 0 || s.itemAmount) ? Number(s.itemAmount) : null,
      q: Number(s.qty || 1),
      a: Number(s.amount || 0)
    })));

    const recent = await Transaction.findOne({ admissionId, patientId }).sort({ createdAt: -1 });
    if (recent && (Date.now() - new Date(recent.createdAt).getTime()) < 8000) {
      if (normalize(recent.services) === normalize(services)) {
        console.log('[ChargeSlip] Duplicate detected within 8s, skipping create');
        return res.redirect('/emergency');
      }
    }
  } catch (e) {
    console.warn('[ChargeSlip] Duplicate guard check failed:', e.message);
  }

  // Create new instance manually instead of using .create() to avoid any middleware issues
  const transaction = new Transaction(docToCreate);
  await transaction.save();

  // Emit Socket.IO notification for billing
  const io = req.app.get('io');
  const patient = await Patient.findById(patientId);
  
  if (io && patient) {
    const totalAmount = services.reduce((sum, s) => sum + (s.amount || 0), 0);
    io.emit('newBilling', {
      patientId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      totalAmount,
      timestamp: new Date()
    });

    // Save notification to database with requested phrasing
    const Notification = require('../models/Notification');
    const lastName = (patient.lastName || '').charAt(0).toUpperCase() + (patient.lastName || '').slice(1).toLowerCase();
    const firstName = (patient.firstName || '').charAt(0).toUpperCase() + (patient.firstName || '').slice(1).toLowerCase();
    const displayName = `${lastName}, ${firstName}`.trim();
    await Notification.create({
      patientId: patient.patientId,
      fullName: displayName,
      message: `Patient HRN ${patient.patientId} ${displayName} Charge Slip Submitted for Billing`,
      department: 'Billing',
      read: false
    });
  }

  res.redirect('/emergency');
});

// Void a single service line from a transaction
router.post('/emergency/void-service', async (req, res) => {
  try {
    const { transactionId, serviceId, patientId } = req.body;
    if (!transactionId || !serviceId || !patientId) {
      return res.status(400).send('Missing parameters');
    }

    // Check if transaction has been confirmed by billing - block void if so
    const transaction = await Transaction.findById(transactionId);
    if (transaction) {
      if (transaction.status === 'Payment Verified') {
        return res.status(403).send('Cannot void: Transaction has been paid');
      }
      if (transaction.status === 'Billing Confirmed') {
        return res.status(403).send('Cannot void: Transaction has been confirmed by billing');
      }
    }

    // Remove the service line
    await Transaction.updateOne(
      { _id: transactionId },
      { $pull: { services: { _id: serviceId } } }
    );

    // If transaction is now empty, delete it
    const remaining = await Transaction.findById(transactionId);
    if (remaining && Array.isArray(remaining.services) && remaining.services.length === 0) {
      await Transaction.deleteOne({ _id: transactionId });
    }

    return res.redirect(`/emergency/view/${encodeURIComponent(patientId)}`);
  } catch (err) {
    console.error('Error voiding service:', err);
    return res.status(500).send('Failed to void service');
  }
});

// Void multiple services endpoint
router.post('/emergency/view/:id/void-services', async (req, res) => {
  const VoidedTransaction = require('../models/VoidedTransaction');
  const patientId = req.params.id;
  const { services, reason } = req.body;

  if (!services || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ success: false, message: 'No services selected' });
  }

  if (!reason || !['Wrong punch', 'Change of mind'].includes(reason)) {
    return res.status(400).json({ success: false, message: 'Invalid void reason' });
  }

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    console.log('[Void Services] Patient found:', patient.patientId);
    console.log('[Void Services] Services to void:', JSON.stringify(services, null, 2));

    // Group services by transaction ID
    const servicesByTransaction = {};
    services.forEach(s => {
      if (!servicesByTransaction[s.transactionId]) {
        servicesByTransaction[s.transactionId] = [];
      }
      servicesByTransaction[s.transactionId].push(s.serviceIndex);
    });

    // Process each transaction
    for (const [transactionId, serviceIndexes] of Object.entries(servicesByTransaction)) {
      const transaction = await Transaction.findOne({ transactionId });
      if (!transaction) continue;

      // Check if transaction has been confirmed by billing - block void if so
      if (transaction.status === 'Payment Verified') {
        return res.status(403).json({ 
          success: false, 
          message: 'Cannot void: Transaction has been paid' 
        });
      }
      if (transaction.status === 'Billing Confirmed') {
        return res.status(403).json({ 
          success: false, 
          message: 'Cannot void: Transaction has been confirmed by billing' 
        });
      }

      // Sort indexes in descending order to avoid index shifting issues
      const sortedIndexes = serviceIndexes.sort((a, b) => b - a);

      for (const idx of sortedIndexes) {
        const service = transaction.services[idx];
        if (!service) continue;

        // Create voided transaction record
        await VoidedTransaction.create({
          originalTransactionId: transactionId,
          admissionId: transaction.admissionId,
          patientId: patient.patientId,
          department: 'Emergency',
          service: {
            serviceType: service.type,
            description: service.description,
            procedureAmount: service.procedureAmount,
            itemUsed: service.itemUsed,
            itemAmount: service.itemAmount,
            qty: service.qty,
            amount: service.amount
          },
          voidReason: reason,
          voidedBy: 'Emergency Staff'
        });

        // Remove service from transaction
        transaction.services.splice(idx, 1);
      }

      // Save or delete transaction
      if (transaction.services.length === 0) {
        await Transaction.deleteOne({ transactionId });
      } else {
        await transaction.save();
      }
    }

    return res.json({ success: true, message: 'Services voided successfully' });
  } catch (err) {
    console.error('Error voiding services:', err);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({ success: false, message: 'Failed to void services', error: err.message });
  }
});


// Voided transactions list
router.get('/emergency/voided', async (req, res) => {
  const VoidedTransaction = require('../models/VoidedTransaction');
  const Patient = require('../models/patient');

  try {
    const voidedTransactions = await VoidedTransaction.find({ department: 'Emergency' }).sort({ voidedAt: -1 });
    
    // Group by patient
    const patientMap = {};
    for (const vt of voidedTransactions) {
      if (!patientMap[vt.patientId]) {
        const patient = await Patient.findOne({ patientId: vt.patientId });
        if (patient) {
          patientMap[vt.patientId] = {
            hrn: vt.patientId,
            fullName: patient.fullName || `${patient.lastName}, ${patient.firstName}`,
            birthday: patient.birthdate || patient.birthday,
            voidedBy: vt.voidedBy,
            voidedAt: vt.voidedAt,
            count: 1
          };
        }
      } else {
        patientMap[vt.patientId].count++;
        // Keep the most recent void date
        if (new Date(vt.voidedAt) > new Date(patientMap[vt.patientId].voidedAt)) {
          patientMap[vt.patientId].voidedAt = vt.voidedAt;
        }
      }
    }

    const patients = Object.values(patientMap);
    res.render('emergencyvoid', { patients });
  } catch (err) {
    console.error('Error fetching voided transactions:', err);
    res.status(500).send('Server Error');
  }
});

// Voided transaction details for a patient
router.get('/emergency/voided/:patientId', async (req, res) => {
  const VoidedTransaction = require('../models/VoidedTransaction');
  const Patient = require('../models/patient');
  const patientId = req.params.patientId;

  try {
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const voidedTransactions = await VoidedTransaction.find({ 
      patientId, 
      department: 'Emergency' 
    }).sort({ voidedAt: -1 });

    res.render('emergencyvoiddetails', { patient, voidedTransactions });
  } catch (err) {
    console.error('Error fetching voided transaction details:', err);
    res.status(500).send('Server Error');
  }
});


// Update diagnose - allowed even if transactions exist
router.post('/emergency/view/:id/diagnose/update', async (req, res) => {
  const { id: patientIdOrTempId } = req.params;
  const { medicalId, diagnoseIndex, complaint, doctor_order, nurse_assist, doctor } = req.body;

  try {
    console.log(`📝 Updating diagnose for patient: ${patientIdOrTempId}, diagnose index: ${diagnoseIndex}`);

    // Find patient
    let patient;
    if (patientIdOrTempId.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(patientIdOrTempId);
    } else {
      patient = await Patient.findOne({ patientId: patientIdOrTempId });
    }

    if (!patient) {
      console.error('❌ Patient not found');
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Find medical record
    const medical = await Medical.findById(medicalId);
    if (!medical) {
      console.error('❌ Medical record not found');
      return res.status(404).json({ success: false, message: 'Medical record not found' });
    }

    // Validate diagnose index
    if (!medical.diagnose || !medical.diagnose[diagnoseIndex]) {
      return res.status(404).json({ success: false, message: 'Diagnose not found' });
    }

    // Look up nurse (store as full name string, not ObjectId)
    const selectedNurse = await Nurse.findOne({ nurseId: nurse_assist });
    if (!selectedNurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }
    const nurseFullName = `${selectedNurse.firstName} ${selectedNurse.middleInitial || ''} ${selectedNurse.lastName}`.trim();

    // Look up doctor (store as full name string, not ObjectId)
    const selectedDoctor = await Doctor.findOne({ doctorId: doctor });
    if (!selectedDoctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    const doctorFullName = `${selectedDoctor.firstName} ${selectedDoctor.middleName || ''} ${selectedDoctor.lastName}`.trim();

    // Update the diagnose at the specific index (preserve date)
    medical.diagnose[diagnoseIndex] = {
      date: medical.diagnose[diagnoseIndex].date, // Preserve existing date
      complaint,
      doctor_order,
      nurse_assist: nurseFullName,
      doctor: doctorFullName
    };

    await medical.save();

    console.log('✅ Diagnose updated successfully');
    res.json({ success: true, message: 'Diagnose updated successfully' });
  } catch (error) {
    console.error('❌ Diagnose Update Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});


// Delete diagnose - only if NO transactions exist
router.post('/emergency/view/:id/diagnose/delete', async (req, res) => {
  const { id: patientIdOrTempId } = req.params;
  const { medicalId, diagnoseIndex, reason, deletedBy } = req.body;

  try {
    console.log(`🗑️ Deleting diagnose for patient: ${patientIdOrTempId}, diagnose index: ${diagnoseIndex}`);

    // Find patient
    let patient;
    if (patientIdOrTempId.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(patientIdOrTempId);
    } else {
      patient = await Patient.findOne({ patientId: patientIdOrTempId });
    }

    if (!patient) {
      console.error('❌ Patient not found');
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Check if patient has any transactions - if yes, reject delete
    const transactionCount = await Transaction.countDocuments({ patientId: patient._id });
    if (transactionCount > 0) {
      console.log('⚠️ Cannot delete - patient has transactions');
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete diagnose. Patient has charge transactions. You can only edit the diagnose.' 
      });
    }

    // Find medical record
    const medical = await Medical.findById(medicalId);
    if (!medical) {
      console.error('❌ Medical record not found');
      return res.status(404).json({ success: false, message: 'Medical record not found' });
    }

    // Validate diagnose index
    if (!medical.diagnose || !medical.diagnose[diagnoseIndex]) {
      return res.status(404).json({ success: false, message: 'Diagnose not found' });
    }

    const diagnoseToDelete = medical.diagnose[diagnoseIndex];

    // Create deleted diagnose record
    await DeletedDiagnose.create({
      originalMedicalId: medical._id,
      patientId: patient._id,
      department: 'Emergency',
      diagnose: {
        date: diagnoseToDelete.date,
        complaint: diagnoseToDelete.complaint,
        doctor_order: diagnoseToDelete.doctor_order,
        nurse_assist: diagnoseToDelete.nurse_assist,
        doctor: diagnoseToDelete.doctor
      },
      deleteReason: reason || 'Not specified',
      deletedBy: deletedBy || 'Emergency Staff'
    });

    // Remove diagnose from medical record
    medical.diagnose.splice(diagnoseIndex, 1);
    await medical.save();

    console.log('✅ Diagnose deleted successfully');
    res.json({ success: true, message: 'Diagnose deleted successfully' });
  } catch (error) {
    console.error('❌ Diagnose Delete Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// Mark as Cleared (Emergency)
router.post('/emergency/view/:id/mark-cleared', async (req, res) => {
  const hrn = req.params.id;
  try {
    const admission = await Admission.findOne({ patientId: hrn });
    if (!admission) return res.status(404).send('Admission not found');

    // Verify all transactions for this admission are Payment Verified
    const pendingCount = await Transaction.countDocuments({
      admissionId: admission.admittingId,
      status: { $ne: 'Payment Verified' }
    });

    if (pendingCount > 0) {
      return res.status(400).send('Cannot clear: there are unverified transactions for this admission');
    }

    await Admission.updateOne({ _id: admission._id }, {
      $set: { isCleared: true, clearedAt: new Date(), clearedBy: 'Emergency' }
    });

    res.redirect(`/emergency/view/${encodeURIComponent(hrn)}`);
  } catch (err) {
    console.error('Error marking cleared (Emergency):', err);
    res.status(500).send('Server Error');
  }
});

// Deleted diagnoses list
router.get('/emergency/deleted-diagnoses', async (req, res) => {
  try {
    const deletedDiagnoses = await DeletedDiagnose.find({ department: 'Emergency' })
      .populate('patientId')
      .populate('diagnose.doctor')
      .populate('diagnose.nurse_assist')
      .sort({ deletedAt: -1 });

    res.render('emergencyDeletedDiagnoses', { deletedDiagnoses });
  } catch (err) {
    console.error('Error fetching deleted diagnoses:', err);
    res.status(500).send('Server Error');
  }
});


module.exports = router;
