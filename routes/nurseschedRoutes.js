// routes/nurseschedRoutes.js
const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');
const NurseSchedule = require('../models/NurseSchedule'); // You need to create this model (see below)

router.get('/nursescheduling', async (req, res) => {
  const allNurses = await Nurse.find();
  
  // Filter only active nurses with valid licenses
  const today = new Date();
  const nurses = allNurses.filter(nurse => {
    const isLicenseValid = !nurse.validUntil || new Date(nurse.validUntil) >= today;
    const isActive = nurse.status === 'active';
    return isLicenseValid && isActive;
  });
  
  res.render('nursescheduling', { nurses });
});

router.post('/save-nurse-schedule/:nurseId', async (req, res) => {
  const { nurseId } = req.params;
  const setIds = req.body.setIds.split(',');

  try {
    for (const setId of setIds) {
      const days = req.body[`days-${setId}`];
      const startTime = req.body[`startTime-${setId}`];
      const endTime = req.body[`endTime-${setId}`];
      const departments = req.body[`departments-${setId}`];
      const duties = req.body[`duties-${setId}`];

      if (!days || !startTime || !endTime) continue;

      const daysArray = Array.isArray(days) ? days : [days];
      const departmentsArray = Array.isArray(departments) ? departments : [departments];
      const dutiesArray = Array.isArray(duties) ? duties : [duties];

      for (const day of daysArray) {
        const schedule = new NurseSchedule({
          nurseId,
          date: day,
          startTime,
          endTime,
          departments: departmentsArray,
          duties: dutiesArray
        });
        await schedule.save();
      }
    }

    res.redirect('/nursescheduling');
  } catch (error) {
    console.error('Error saving nurse schedule:', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;
// API endpoints for FullCalendar (nurse)
router.get('/api/nurse-schedule/:nurseId', async (req, res) => {
  try {
    const schedules = await NurseSchedule.find({ nurseId: req.params.nurseId });
    res.json(schedules);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

router.post('/api/nurse-schedule/:nurseId', async (req, res) => {
  try {
    const { date, startTime, endTime, department } = req.body;
    if (!date || !startTime || !endTime || !department) return res.status(400).json({ error: 'Missing fields' });
    const sched = new NurseSchedule({ nurseId: req.params.nurseId, date, startTime, endTime, department });
    await sched.save();
    res.json({ success: true, _id: sched._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

router.put('/api/nurse-schedule/:id', async (req, res) => {
  try {
    const { date, startTime, endTime, department } = req.body;
    if (!date || !startTime || !endTime || !department) return res.status(400).json({ error: 'Missing fields' });
    await NurseSchedule.findByIdAndUpdate(req.params.id, { date, startTime, endTime, department });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

router.delete('/api/nurse-schedule/:id', async (req, res) => {
  try {
    await NurseSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});
