const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');

// GET /audittrail - show all audit logs
router.get('/', async (req, res) => {
  try {
    const auditLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(200);
    res.render('audittrail', { auditLogs });
  } catch (err) {
    res.status(500).send('Error loading audit trail');
  }
});

module.exports = router;
