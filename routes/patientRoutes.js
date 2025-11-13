const express = require('express');
const router = express.Router();
const moment = require('moment');
// Models
const OnHold = require('../models/OnHold');
const Patient = require('../models/patient');
const Admission = require('../models/Admission');
const Medical = require('../models/Medical');
const Transaction = require('../models/Transaction');
const ProcessedPatient = require('../models/ProcessedPatient');

// HRN generator — format: YY-00-00-XX where XX increments per new patient or on-hold
async function generateHRN() {
  const yy = moment().format('YY');
  const prefix = `${yy}-00-00-`;

  // Find the most recent patient and on-hold with this prefix and take the highest suffix
  const lastPatient = await Patient.findOne({ patientId: { $regex: `^${prefix}` } }).sort({ patientId: -1 }).exec().catch(()=>null);
  const lastOnHold = await OnHold.findOne({ tempId: { $regex: `^${prefix}` } }).sort({ tempId: -1 }).exec().catch(()=>null);

  let lastSeq = 0;
  if (lastPatient && lastPatient.patientId) {
    const parts = lastPatient.patientId.split('-');
    const n = parseInt(parts[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }
  if (lastOnHold && lastOnHold.tempId) {
    const parts = lastOnHold.tempId.split('-');
    const n = parseInt(parts[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }

  const next = String(lastSeq + 1).padStart(2, '0');
  return `${prefix}${next}`;
}
// Increment HRN suffix: input like '25-00-00-03' -> '25-00-00-04'
function incrementHRN(hrn) {
  if (!hrn) return hrn;
  const parts = hrn.split('-');
  if (parts.length !== 4) return hrn;
  const last = parseInt(parts[3], 10);
  if (isNaN(last)) return hrn;
  const next = String(last + 1).padStart(parts[3].length, '0');
  return `${parts[0]}-${parts[1]}-${parts[2]}-${next}`;
}
// GET /patient route
router.get('/patient', async (req, res) => {
  try {
    const { success, error, holdId, savedHr, savedName, unidentified } = req.query;

    let hold = null;
    if (holdId) {
      hold = await OnHold.findById(holdId);
    }

  // Use hrn from query if provided (so after save we can pass next HRN);
  // otherwise generate the next HRN from DB.
  const prefillHrn = req.query.hrn || await generateHRN();
    const regDate = moment().format('YYYY-MM-DD HH:mm:ss');

    res.render('patient', {
      success,
      error,
      hold,
      hrn: prefillHrn,
      regDate,
      savedHr,
      savedName,
      unidentified
    });
  } catch (err) {
    console.error('Error loading /patient page:', err);
    res.render('patient', {
      error: 'Something went wrong while loading the form.',
      success: null,
      hold: null,
      hrn: await generateHRN()
    });
  }
});

// POST /patient route
router.post('/patient', async (req, res) => {
  try {
  // Pre-generate next HRN for form rendering on errors
  const prefillHrn = await generateHRN();

    // Debug: log incoming body for troubleshooting unidentified saves
    console.log('POST /patient received body:', JSON.stringify(req.body));

    // If the submission is from the 'Unidentified' on-hold section, create a Patient record
    // using the HRN (prefilled `hrn`) as patientId and merge any available normal inputs
    // with the on-hold inputs. Do NOT create separate OnHold documents — everything goes
    // into the Patient document so staff can edit it later when the person is identified.
    if (req.body && String(req.body.unidentified) === '1') {
      console.log('Handling unidentified save flow');
      const {
        // possible normal patient inputs (may be empty when on-hold is used)
        firstName: nf, lastName: nl, middleInitial: nmi, birthDate: nbd, gender: ng,
        edad: nedad, civilStatus: ncivil, address: naddress, contactDigits: ncontact,
        religion: nreligion, bp: nbp, hr: nhr, rr: nrr, temp: ntemp, spo2: nspo2,
        height: nheight, weight: nweight, lmp: nlmp,
        // on-hold specific inputs
        estimateAge, clothes, locationFound, status, hrn, dateTimeFound
      } = req.body;

      const statusArray = Array.isArray(status) ? status : (status ? [status] : []);
  // Use provided hrn (hidden `hrn` field) or generate one
  let patientId = hrn || await generateHRN();
  console.log('Assigned patientId for unidentified:', patientId);

      const safeLower = (v) => (v || '').toLowerCase();

      const registrationDate = dateTimeFound ? new Date(dateTimeFound) : new Date();

      // Build Patient using normal inputs when present, otherwise fall back to on-hold values
      const newPatient = new Patient({
        patientId,
        firstName: (nf && nf.trim()) ? safeLower(nf) : 'UNIDENTIFIED',
        lastName: (nl && nl.trim()) ? safeLower(nl) : patientId,
        middleInitial: nmi || '',
        birthDate: nbd ? new Date(nbd) : undefined,
        gender: (ng && ng.trim()) ? safeLower(ng) : 'Unknown',
        edad: (nedad && nedad.trim()) ? nedad : (estimateAge || ''),
        civilStatus: ncivil || '',
        // Do NOT overwrite address with locationFound
        address: (naddress && naddress.trim()) ? naddress : '',
        foundLocation: locationFound || '',
        contactInfo: ncontact ? String(ncontact).replace(/\D/g,'') : '',
        clothes: clothes || '',
        onHoldStatus: statusArray,
        religion: nreligion || '',
        bp: nbp || '',
        hr: nhr || '',
        rr: nrr || '',
        temp: ntemp || '',
        spo2: nspo2 || '',
        height: nheight || '',
        weight: nweight || '',
        lmp: nlmp ? new Date(nlmp) : undefined,
        registrationDate
      });

      // Attempt save, retrying HRN generation if unique constraint collides
      let savedPatient = false;
      let attempts = 0;
      while (!savedPatient && attempts < 3) {
        attempts++;
        try {
          await newPatient.save();
          savedPatient = true;
          console.log('Unidentified patient saved:', newPatient.patientId, newPatient._id);
        } catch (saveErr) {
          if (saveErr && saveErr.code === 11000 && attempts < 3) {
            newPatient.patientId = await generateHRN();
            continue;
          }
          console.error('Error saving unidentified patient:', saveErr);
          throw saveErr;
        }
      }

      const displayName = `${newPatient.lastName} ${newPatient.firstName}`.trim();
      
      // Emit socket event for dashboard refresh
      const io = req.app.get('io');
      if (io) io.emit('dashboardRefresh');
      
      return res.redirect(`/patient?savedHr=${encodeURIComponent(newPatient.patientId)}&savedName=${encodeURIComponent(displayName)}&saved=1`);
    }

    const {
      firstName,
      lastName,
      middleInitial,
      birthDate,
      gender,
      edad,
      civilStatus,
      address,
      contactDigits,
      religion,
      bp,
      hr,
      rr,
      temp,
      spo2,
      height,
      weight,
      lmp,
      onHoldId
    } = req.body;
    // Validate contact digits: must be exactly 11 digits (old local format, e.g., 09171234567)
    const cleanDigits = String(contactDigits || '').replace(/\D/g, '');
    if (cleanDigits.length !== 11 || !cleanDigits.startsWith('0')) {
      return res.render('patient', {
        error: 'Invalid contact number. Enter exactly 11 digits starting with 0 (e.g. 09171234567).',
        success: null,
        hold: onHoldId ? await OnHold.findById(onHoldId) : null,
        hrn: prefillHrn
      });
    }
    // Store in old local format (11 digits starting with 0)
    const normalizedContact = cleanDigits;

    // Helper to safely lower-case possibly undefined values
    const safeLower = (v) => (v || '').toLowerCase();

  // Server-authoritative HRN (async incremental format)
  const patientId = await generateHRN();

    const startOfDay = new Date(new Date(birthDate).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(birthDate).setHours(23, 59, 59, 999));

    console.log('Checking patient with data:', {
      firstName: safeLower(firstName),
      lastName: safeLower(lastName),
      middleInitial: safeLower(middleInitial),
      gender: safeLower(gender),
      birthDate: `${startOfDay.toISOString()} - ${endOfDay.toISOString()}`
    });

    const existingPatient = await Patient.findOne({
      firstName: safeLower(firstName),
      lastName: safeLower(lastName),
      middleInitial: safeLower(middleInitial),
      gender: safeLower(gender),
      birthDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    console.log('Existing patient:', existingPatient);

    if (existingPatient) {
      return res.render('patient', {
        error: 'This patient already has an account.',
        success: null,
        hold: onHoldId ? await OnHold.findById(onHoldId) : null,
        hrn: prefillHrn
      });
    }

    const newPatient = new Patient({
      patientId,
      firstName: safeLower(firstName),
      lastName: safeLower(lastName),
      middleInitial: safeLower(middleInitial),
      birthDate: startOfDay,
      gender: safeLower(gender),
      edad,
      civilStatus,
      address,
  contactInfo: normalizedContact,
      religion,
      bp,
      hr,
      rr,
      temp,
      spo2,
      height,
      weight,
      lmp: lmp ? new Date(lmp) : undefined,
      registrationDate: new Date()
    });

    // Attempt save, retrying HRN generation if unique constraint collides
    let saved = false;
    let attempts = 0;
    while (!saved && attempts < 3) {
      attempts++;
      try {
        await newPatient.save();
        saved = true;
      } catch (saveErr) {
        // If duplicate key on patientId, generate a new HRN and retry
        if (saveErr && saveErr.code === 11000 && attempts < 3) {
          newPatient.patientId = await generateHRN();
          continue;
        }
        throw saveErr;
      }
    }

    if (onHoldId) {
      // Get the on-hold patient record
      const onHoldPatient = await OnHold.findById(onHoldId);

      if (onHoldPatient && onHoldPatient.tempId) {
        const tempId = onHoldPatient.tempId; // Keep the same tempId as final HRN

        // SIMPLIFIED: Just update the existing Patient record in place (no HRN change)
        await Patient.findOneAndUpdate(
          { patientId: tempId },
          { 
            $set: { 
              firstName: safeLower(firstName),
              lastName: safeLower(lastName),
              middleInitial: safeLower(middleInitial),
              birthDate: startOfDay,
              gender: safeLower(gender),
              edad,
              civilStatus,
              address,
              contactInfo: normalizedContact,
              religion,
              bp,
              hr,
              rr,
              temp,
              spo2,
              height,
              weight,
              lmp: lmp ? new Date(lmp) : undefined,
              registrationDate: new Date()
            } 
          }
        );

        // Update fullName in Admissions (patientId stays the same)
        const newFullName = `${safeLower(firstName)} ${safeLower(middleInitial) || ''} ${safeLower(lastName)}`.trim();
        await Admission.updateMany(
          { patientId: tempId },
          { $set: { fullName: newFullName } }
        );

        // Update OnHold status for tracking purposes
        await OnHold.findByIdAndUpdate(onHoldId, {
          onHoldStatus: ['Registered'],
          registeredPatientId: tempId
        });

        // Emit events to refresh UIs
        const io = req.app.get('io');
        if (io) {
          io.emit('billingRefresh');
          io.emit('admissionsRefresh');
        }

        console.log(`Updated patient ${tempId} with real information (kept same HRN)`);
        
        // Use tempId as the final patientId
        const displayName = `${lastName} ${firstName} ${middleInitial || ''}`.trim();
        return res.redirect(`/patient?savedHr=${encodeURIComponent(tempId)}&savedName=${encodeURIComponent(displayName)}&saved=1`);
      }
    }

  const displayName = `${lastName} ${firstName} ${middleInitial || ''}`.trim();
  
  // Emit socket event for dashboard refresh
  const io = req.app.get('io');
  if (io) io.emit('dashboardRefresh');
  
  // Redirect back with saved HRN and display name so the UI can render the exact message
  res.redirect(`/patient?savedHr=${encodeURIComponent(patientId)}&savedName=${encodeURIComponent(displayName)}&saved=1`);
  } catch (err) {
    console.error(err);
    const hrn = await generateHRN();
    res.render('patient', { error: 'Error saving patient data', success: null, hold: null, hrn });

  }
});

// Get patient info by patientId (including on-hold patients by tempId)
router.get('/api/patients/:id', async (req, res) => {
  const patient = await Patient.findOne({ patientId: req.params.id });
  res.json(patient || {});
});

module.exports = router;

// ----------------------------
// Patient view / edit / update / delete (Option A)
// ----------------------------

// View a patient's details (read-only)
router.get('/patients/:patientId/view', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { success, error } = req.query;
    // Try to find a discharged patient record first
    const discharged = await require('../models/DischargedPatient').findOne({ patientId });
    if (discharged) {
      // Also get patient base info for extra fields
      const patientBase = await require('../models/Patient').findOne({ patientId });
      // Find doctor who gave 'inom gamot' order
      let doctorOrderContent = '';
      if (Array.isArray(discharged.diagnoses) && discharged.diagnoses.length > 0) {
        doctorOrderContent = discharged.diagnoses[0].doctor_order || '';
      }
      res.render('dischargedpatientView', {
        patient: {
          hrn: discharged.patientId,
          fullName: discharged.fullName || (patientBase ? `${patientBase.lastName}, ${patientBase.firstName} ${patientBase.middleInitial || ''}` : ''),
          age: patientBase ? patientBase.edad : '',
          gender: patientBase ? patientBase.gender : '',
          address: patientBase ? patientBase.address : '',
          civilStatus: patientBase ? patientBase.civilStatus : '',
          philhealthNo: '',
          birthday: patientBase ? patientBase.birthDate : '',
          religion: patientBase ? patientBase.religion : '',
          admittedBy: discharged.clearedBy || '',
          dischargedBy: discharged.dischargedBy || '',
          physician: discharged.diagnoses?.[0]?.doctor || '',
          nurse: discharged.diagnoses?.[0]?.nurse_assist || '',
          admittedAt: discharged.admittedAt ? new Date(discharged.admittedAt).toLocaleString() : '',
          dischargedAt: discharged.dischargedAt ? new Date(discharged.dischargedAt).toLocaleString() : '',
          totalDays: discharged.admittedAt && discharged.dischargedAt ? Math.ceil((new Date(discharged.dischargedAt) - new Date(discharged.admittedAt)) / (1000*60*60*24)) : '',
          admittingDiagnosis: discharged.diagnoses?.[0]?.complaint || '',
          finalDiagnosis: doctorOrderContent,
          operation: '',
          icd10: '',
          allergicTo: '',
          socialService: '',
          disposition: '',
          results: '',
          placeOfOccurrence: '',
          transferredTo: '',
          prcLicense: ''
        },
        success: success || null,
        error: error || null
      });
      return;
    }
    // Fallback: normal patient view
    const patient = await require('../models/Patient').findOne({ patientId });
    if (!patient) return res.status(404).send('Patient not found');
    const processedRec = await require('../models/ProcessedPatient').findOne({ patientId });
    const isProcessed = !!(processedRec && processedRec.processed);
    const [admissionCount, medicalCount] = await Promise.all([
      require('../models/Admission').countDocuments({ patientId }),
      require('../models/Medical').countDocuments({ patientId })
    ]);
    res.render('patientView', {
      patient,
      isProcessed,
      admissionCount,
      medicalCount,
      success: success || null,
      error: error || null
    });
  } catch (err) {
    console.error('Error loading patient view:', err);
    res.status(500).send('Server Error');
  }
});

// Edit page - prefilled form
router.get('/patients/:patientId/edit', async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.status(404).send('Patient not found');
    // Block editing if currently processed for admission
    const processedRec = await ProcessedPatient.findOne({ patientId });
    if (processedRec && processedRec.processed) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Cannot update: patient is currently in process for admission.'));
    }
    res.render('patientEdit', { patient });
  } catch (err) {
    console.error('Error loading patient edit:', err);
    res.status(500).send('Server Error');
  }
});

// Update patient
router.post('/patients/:patientId/update', async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.status(404).send('Patient not found');

    // Block updating if currently processed for admission
    const processedRec = await ProcessedPatient.findOne({ patientId });
    if (processedRec && processedRec.processed) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Cannot update: patient is currently in process for admission.'));
    }

    const {
      firstName,
      lastName,
      middleInitial,
      birthDate,
      gender,
      edad,
      civilStatus,
      address,
      contactDigits,
      religion,
      bp,
      hr,
      rr,
      temp,
      spo2,
      height,
      weight,
      lmp
    } = req.body;

    const cleanDigits = String(contactDigits || '').replace(/\D/g, '');
    if (cleanDigits && (cleanDigits.length !== 11 || !cleanDigits.startsWith('0'))) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Invalid contact number. Enter exactly 11 digits starting with 0 (e.g. 09171234567).'));
    }
    const normalizedContact = cleanDigits || '';

    const safeLower = (v) => (v || '').toLowerCase();
    const startOfDay = birthDate ? new Date(new Date(birthDate).setHours(0, 0, 0, 0)) : undefined;

    const updates = {
      firstName: safeLower(firstName || patient.firstName),
      lastName: safeLower(lastName || patient.lastName),
      middleInitial: safeLower(middleInitial || patient.middleInitial),
      gender: safeLower(gender || patient.gender),
      edad: typeof edad !== 'undefined' ? edad : patient.edad,
      civilStatus: typeof civilStatus !== 'undefined' ? civilStatus : patient.civilStatus,
      address: typeof address !== 'undefined' ? address : patient.address,
      contactInfo: normalizedContact || patient.contactInfo,
      religion: typeof religion !== 'undefined' ? religion : patient.religion,
      bp: typeof bp !== 'undefined' ? bp : patient.bp,
      hr: typeof hr !== 'undefined' ? hr : patient.hr,
      rr: typeof rr !== 'undefined' ? rr : patient.rr,
      temp: typeof temp !== 'undefined' ? temp : patient.temp,
      spo2: typeof spo2 !== 'undefined' ? spo2 : patient.spo2,
      height: typeof height !== 'undefined' ? height : patient.height,
      weight: typeof weight !== 'undefined' ? weight : patient.weight,
    };
    if (startOfDay) updates.birthDate = startOfDay;
    if (lmp) updates.lmp = new Date(lmp);

    await Patient.updateOne({ patientId }, { $set: updates });

    // Update fullName in Admissions (patientId stays the same)
    const newFullName = `${safeLower(firstName || patient.firstName)} ${safeLower(middleInitial || patient.middleInitial) || ''} ${safeLower(lastName || patient.lastName)}`.trim();
    await Admission.updateMany(
      { patientId },
      { $set: { fullName: newFullName } }
    );

    const displayName = `${(lastName || patient.lastName).toUpperCase()} ${(firstName || patient.firstName).toUpperCase()} ${(middleInitial || patient.middleInitial || '').toUpperCase()}`.trim();
    return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?success=` + encodeURIComponent(`Update HRN ${patientId} ${displayName}`));
  } catch (err) {
    console.error('Error updating patient:', err);
    return res.redirect(`/patients/${encodeURIComponent(req.params.patientId)}/view?error=` + encodeURIComponent('Failed to update patient.'));
  }
});

// Delete patient (guarded)
router.post('/patients/:patientId/delete', async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.redirect('/admit-list?error=' + encodeURIComponent('Patient not found'));

    const processedRec = await ProcessedPatient.findOne({ patientId });
    const isProcessed = !!(processedRec && processedRec.processed);
    const [admissionCount, medicalCount] = await Promise.all([
      Admission.countDocuments({ patientId }),
      Medical.countDocuments({ patientId })
    ]);

    if (isProcessed) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Cannot delete: patient is currently in process for admission.'));
    }
    if (admissionCount > 0 || medicalCount > 0) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent(`Cannot delete: patient has related records (Admissions: ${admissionCount}, Medical: ${medicalCount}).`));
    }

    await Patient.deleteOne({ patientId });
    // Clean up processed record if any
    await ProcessedPatient.deleteOne({ patientId }).catch(() => {});

    const displayName = `${(patient.lastName || '').toUpperCase()} ${(patient.firstName || '').toUpperCase()} ${(patient.middleInitial || '').toUpperCase()}`.trim();
    return res.redirect('/admit-list?success=' + encodeURIComponent(`Deleted HRN ${patientId} ${displayName}`));
  } catch (err) {
    console.error('Error deleting patient:', err);
    return res.redirect(`/patients/${encodeURIComponent(req.params.patientId)}/view?error=` + encodeURIComponent('Failed to delete patient.'));
  }
});

// Archive patient (soft delete with reason)
router.post('/patients/:patientId/archive', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { reason } = req.body;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.redirect('/admit-list?error=' + encodeURIComponent('Patient not found'));

    // Block archiving if already archived
    if (patient.isArchived) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Patient is already archived.'));
    }

    // Block archiving if patient is currently in process for admission
    const processedRec = await ProcessedPatient.findOne({ patientId });
    const isProcessed = !!(processedRec && processedRec.processed);
    if (isProcessed) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Cannot archive: patient is currently in process for admission.'));
    }

    // Archive (allow even with linked Admissions/Medical since it's non-destructive)
    const trimmedReason = String(reason || '').trim();
    await Patient.updateOne(
      { patientId },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: 'admin', // TODO: wire session user later
          archivedFrom: 'Triage', // TODO: wire actual department from session later
          archiveReason: trimmedReason || 'No reason provided'
        }
      }
    );

    // Send notification to Admission that HRN was archived
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        patientId,
        message: `HRN ${patientId} has been archived`,
        department: 'Admission',
        read: false
      });
    } catch (e) {
      console.warn('Failed to create archive notification:', e.message);
    }

    const displayName = `${(patient.lastName || '').toUpperCase()} ${(patient.firstName || '').toUpperCase()} ${(patient.middleInitial || '').toUpperCase()}`.trim();
    return res.redirect('/admit-list?success=' + encodeURIComponent(`Archived HRN ${patientId} ${displayName}`));
  } catch (err) {
    console.error('Error archiving patient:', err);
    return res.redirect(`/patients/${encodeURIComponent(req.params.patientId)}/view?error=` + encodeURIComponent('Failed to archive patient.'));
  }
});

// Restore patient (unarchive)
router.post('/patients/:patientId/restore', async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.redirect('/patient-archive?error=' + encodeURIComponent('Patient not found'));

    if (!patient.isArchived) {
      return res.redirect(`/patients/${encodeURIComponent(patientId)}/view?error=` + encodeURIComponent('Patient is not archived.'));
    }

    // Restore
    await Patient.updateOne(
      { patientId },
      {
        $set: {
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
          archivedFrom: null,
          archiveReason: null
        }
      }
    );

    const displayName = `${(patient.lastName || '').toUpperCase()} ${(patient.firstName || '').toUpperCase()} ${(patient.middleInitial || '').toUpperCase()}`.trim();
    return res.redirect('/admit-list?success=' + encodeURIComponent(`Restored HRN ${patientId} ${displayName}`));
  } catch (err) {
    console.error('Error restoring patient:', err);
    return res.redirect('/patient-archive?error=' + encodeURIComponent('Failed to restore patient.'));
  }
});
