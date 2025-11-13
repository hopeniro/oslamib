const express = require('express');
const router = express.Router();
const Admission = require('../models/Admission');
const Nurse = require('../models/Nurse');
const Medical = require('../models/Medical');
const Transaction = require('../models/Transaction');
const DischargedPatient = require('../models/DischargedPatient');

// GET /admittedpatient - show all admitted patients
router.get('/admittedpatient', async (req, res) => {
  try {
    const admittedPatients = await Admission.find().sort({ admittedAt: -1 });
    
    // For each admission, check if patient has been processed (diagnose or charges after admission)
    const patientsWithNurse = await Promise.all(
      admittedPatients.map(async (admission) => {
        const medical = await Medical.findOne({ patientId: admission.patientId });
        
        let autoNurseName = '—';
        let hasProcessing = false;
        
        if (medical && medical.diagnose && medical.diagnose.length > 0) {
          // Get the most recent diagnose entry (last item in array)
          const recentDiagnose = medical.diagnose[medical.diagnose.length - 1];
          autoNurseName = recentDiagnose.nurse_assist || '—';
          
          // Check if any diagnose was added after admission
          const diagnosesAfterAdmission = medical.diagnose.filter(d => {
            return new Date(d.date) >= new Date(admission.admittedAt);
          });
          
          if (diagnosesAfterAdmission.length > 0) {
            hasProcessing = true;
          }
        }
        
        // Check if patient has any transactions (charge slips)
        if (!hasProcessing) {
          const transactions = await Transaction.findOne({ patientId: admission.patientId });
          if (transactions) {
            hasProcessing = true;
          }
        }
        
        return {
          ...admission.toObject(),
          autoDischargeNurse: autoNurseName,
          hasProcessing
        };
      })
    );
    
    res.render('admittedpatient', { admittedPatients: patientsWithNurse });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading admitted patients');
  }
});

// GET /dischargedpatients - list discharged records
router.get('/dischargedpatients', async (req, res) => {
  try {
    const discharged = await DischargedPatient.find({}).sort({ dischargedAt: -1 });
    res.render('dischargedpatient', { discharged });
  } catch (err) {
    console.error('Error loading discharged patients:', err);
    res.status(500).send('Error loading discharged patients');
  }
});

// POST /admittedpatient/discharge - update discharge nurse
router.post('/admittedpatient/discharge', async (req, res) => {
  try {
    const { admissionId, nurseId } = req.body;
    await Admission.findByIdAndUpdate(admissionId, { dischargeBy: nurseId });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update discharge nurse' });
  }
});

// Complete discharge: archive record, clear admission and processed flag
router.post('/admittedpatient/complete-discharge', async (req, res) => {
  try {
    const { admissionId, dischargedBy } = req.body;
    const admission = await Admission.findById(admissionId);
    if (!admission) return res.status(404).json({ error: 'Admission not found' });

    if (!admission.isCleared) {
      return res.status(400).json({ error: 'Admission is not cleared yet' });
    }

    const DischargedPatient = require('../models/DischargedPatient');
    const Patient = require('../models/patient');
    const ProcessedPatient = require('../models/ProcessedPatient');
    const Medical = require('../models/Medical');
    const Transaction = require('../models/Transaction');

    const patient = await Patient.findOne({ patientId: admission.patientId });

    // Collect transactions for this admission (snapshot), then delete them
    let txForAdmission = [];
    let txSnapshot = [];
    try {
      txForAdmission = await Transaction.find({ admissionId: admission.admittingId }).sort({ createdAt: 1 });
      txSnapshot = txForAdmission.map(tx => {
        let services = tx.services;
        if (typeof services === 'string') {
          try {
            const parsed = JSON.parse(services);
            services = Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            services = [];
          }
        }
        if (!Array.isArray(services)) services = [];
        return ({
          transactionId: tx.transactionId,
          status: tx.status,
          createdAt: tx.createdAt,
          services: services.map(s => ({
            serviceType: s.type, // map to safe field name in archive
            description: s.description,
            procedureAmount: s.procedureAmount,
            itemUsed: s.itemUsed,
            itemAmount: s.itemAmount,
            qty: s.qty,
            amount: s.amount
          }))
        });
      });
    } catch (e) {
      console.warn('Discharge: failed to collect transactions snapshot:', e && e.message ? e.message : e);
      txForAdmission = [];
      txSnapshot = [];
    }

    // Collect diagnoses for this admission (by date >= admittedAt)
    let dxSnapshot = [];
    try {
      const medical = await Medical.findOne({ patientId: admission.patientId });
      if (medical && Array.isArray(medical.diagnose)) {
        const admittedAt = admission.admittedAt ? new Date(admission.admittedAt) : null;
        const keep = [];
        for (const d of medical.diagnose) {
          const dDate = d.date ? new Date(d.date) : null;
          if (admittedAt && dDate && dDate >= admittedAt) {
            dxSnapshot.push({
              date: d.date,
              complaint: d.complaint,
              doctor_order: d.doctor_order,
              nurse_assist: d.nurse_assist,
              doctor: d.doctor
            });
          } else {
            keep.push(d);
          }
        }
        // Persist only pre-admission diagnoses
        medical.diagnose = keep;
        await medical.save();
      }
    } catch (e) {
      console.warn('Discharge: failed to collect/prune diagnoses:', e && e.message ? e.message : e);
      dxSnapshot = [];
    }

    // Create discharge archive
    await DischargedPatient.create({
      admittingId: admission.admittingId,
      patientId: admission.patientId,
      patientRef: patient ? patient._id : undefined,
      fullName: admission.fullName,
      birthdate: admission.birthdate,
      department: admission.category,
      admittedAt: admission.admittedAt,
      dischargedAt: new Date(),
      dischargedBy: dischargedBy || admission.dischargeBy || 'Nurse',
      clearedBy: admission.clearedBy || '',
      diagnoses: dxSnapshot,
      transactions: txSnapshot
    });

    // Delete all transactions for this admission to avoid showing in next admissions
    try {
      if (txForAdmission.length > 0) {
        await Transaction.deleteMany({ admissionId: admission.admittingId });
      }
    } catch (e) {
      console.warn('Discharge: failed to delete transactions for admission:', e && e.message ? e.message : e);
    }

    // Remove admission
    await Admission.deleteOne({ _id: admission._id });

    // Clear processed flag so Admit List shows Process
    await ProcessedPatient.deleteOne({ patientId: admission.patientId }).catch(async () => {
      await ProcessedPatient.updateOne({ patientId: admission.patientId }, { $set: { processed: false } }, { upsert: true });
    });

    // Emit socket refresh for admitted patients list
    const io = req.app.get('io');
    if (io) {
      io.emit('admissionsRefresh');
      io.emit('dashboardRefresh'); // Refresh dashboard for discharge stats
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error completing discharge:', err);
    res.status(500).json({ error: 'Failed to complete discharge' });
  }
});

// POST /admittedpatient/cancel - cancel admission (only if not processed)
router.post('/admittedpatient/cancel', async (req, res) => {
  try {
    const { admissionId } = req.body;
    
    // Get the admission record
    const admission = await Admission.findById(admissionId);
    if (!admission) {
      return res.status(404).json({ error: 'Admission not found' });
    }
    
    // Check if patient has been processed
    const medical = await Medical.findOne({ patientId: admission.patientId });
    let hasProcessing = false;
    
    if (medical && medical.diagnose && medical.diagnose.length > 0) {
      // Check if any diagnose was added after admission
      const diagnosesAfterAdmission = medical.diagnose.filter(d => {
        return new Date(d.date) >= new Date(admission.admittedAt);
      });
      
      if (diagnosesAfterAdmission.length > 0) {
        hasProcessing = true;
      }
    }
    
    // Check for transactions
    if (!hasProcessing) {
      const transactions = await Transaction.findOne({ patientId: admission.patientId });
      if (transactions) {
        hasProcessing = true;
      }
    }
    
    // Block cancellation if patient has been processed
    if (hasProcessing) {
      return res.status(403).json({ error: 'Cannot cancel: patient has been processed (has diagnoses or charges)' });
    }
    
    // Delete the admission record
    await Admission.findByIdAndDelete(admissionId);
    
    res.json({ success: true, message: 'Admission cancelled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel admission' });
  }
});

module.exports = router;
