const express = require('express'); 
const router = express.Router();
const Doctor = require('../models/Doctor');
const DoctorSchedule = require('../models/DoctorSchedule');

// ✅ Add this route to show the scheduling form
router.get('/doctorscheduling', async (req, res) => {
  try {
    const allDoctors = await Doctor.find();
    const today = new Date();
    const doctors = allDoctors.filter(d => {
      const isLicenseValid = !d.validUntil || new Date(d.validUntil) >= today;
      const isActive = (d.status || 'active') === 'active';
      return isLicenseValid && isActive;
    });
    res.render('doctorscheduling', { doctors }); // Only active and valid
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).send('Server error');
  }
});

// ✅ Your existing POST route to save the schedule
router.post('/save-schedule/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const setIds = req.body.setIds.split(',');

  console.log('Doctor ID:', doctorId);
  console.log('Set IDs:', setIds);
  console.log('Full Body:', req.body);

  try {
    for (const setId of setIds) {
      const days = req.body[`days-${setId}`];
      const startTime = req.body[`startTime-${setId}`];
      const endTime = req.body[`endTime-${setId}`];
      const specialties = req.body[`specialties-${setId}`];
      const services = req.body[`services-${setId}`];

      if (!days || !startTime || !endTime) {
        console.warn(`Skipping set ${setId} due to missing data.`);
        continue;
      }

      const daysArray = Array.isArray(days) ? days : [days];
      const specialtiesArray = Array.isArray(specialties) ? specialties : [specialties];
      const servicesArray = Array.isArray(services) ? services : [services];

      for (const day of daysArray) {
        const schedule = new DoctorSchedule({
          doctorId,
          date: day,
          startTime,
          endTime,
          specialties: specialtiesArray,
          services: servicesArray
        });

        await schedule.save();
      }
    }

    res.redirect('/doctorscheduling');

  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;
// API endpoints for FullCalendar
router.get('/api/doctor-schedule/:doctorId', async (req, res) => {
  try {
    const schedules = await DoctorSchedule.find({ doctorId: req.params.doctorId });
    res.json(schedules);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

router.post('/api/doctor-schedule/:doctorId', async (req, res) => {
  try {
    const { date, startTime, endTime, department } = req.body;
    if (!date || !startTime || !endTime || !department) return res.status(400).json({ error: 'Missing fields' });
    const doc = new DoctorSchedule({ doctorId: req.params.doctorId, date, startTime, endTime, department, specialties: [], services: [] });
    await doc.save();
    res.json({ success: true, _id: doc._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

router.put('/api/doctor-schedule/:id', async (req, res) => {
  try {
    const { date, startTime, endTime, department } = req.body;
    if (!date || !startTime || !endTime || !department) return res.status(400).json({ error: 'Missing fields' });
    await DoctorSchedule.findByIdAndUpdate(req.params.id, { date, startTime, endTime, department });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

router.delete('/api/doctor-schedule/:id', async (req, res) => {
  try {
    await DoctorSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});
