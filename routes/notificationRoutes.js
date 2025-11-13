const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// Get all notifications (for Admission Records)
router.get('/notifications', async (req, res) => {
  // Include legacy null departments and any case-variant of 'Admission'
  const filter = {
    $or: [
      { department: null },
      { department: { $regex: /^admission$/i } }
    ]
  };
  const notifs = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Get Emergency department notifications
router.get('/notifications/emergency', async (req, res) => {
  const notifs = await Notification.find({ department: 'Emergency' }).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Get OPD department notifications
router.get('/notifications/opd', async (req, res) => {
  const notifs = await Notification.find({ department: 'OPD' }).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Get Billing department notifications
router.get('/notifications/billing', async (req, res) => {
  const notifs = await Notification.find({ department: 'Billing' }).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Get Cashier department notifications
router.get('/notifications/cashier', async (req, res) => {
  const notifs = await Notification.find({ department: 'Cashier' }).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Get Promissory department notifications
router.get('/notifications/promissory', async (req, res) => {
  const notifs = await Notification.find({ department: 'Promissory' }).sort({ createdAt: -1 }).limit(50);
  res.json(notifs);
});

// Mark notification as read
router.post('/notifications/read', async (req, res) => {
  const { patientId, department } = req.body;
  const filter = { patientId };
  if (department) {
    filter.department = department;
  }
  await Notification.updateMany(filter, { $set: { read: true } });
  res.json({ success: true });
});

module.exports = router;
