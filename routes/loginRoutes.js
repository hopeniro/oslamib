const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcrypt');

// Login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const staff = await Staff.findOne({ username });
  if (!staff) {
    return res.status(401).render('login', { error: 'Invalid username or password' });
  }
  const match = await bcrypt.compare(password, staff.password);
  if (!match) {
    return res.status(401).render('login', { error: 'Invalid username or password' });
  }
  // Set session
  req.session.userId = staff.staffId;
  req.session.username = staff.username;
  req.session.category = staff.category;
  req.session.emailAddress = staff.emailAddress;
  req.session.fullName = `${staff.firstName} ${staff.lastName}`;
  // Audit log entry
  try {
    await AuditLog.create({
      userId: staff.staffId,
      username: staff.username,
      action: 'login',
      recordType: 'Staff',
      recordId: staff.staffId,
      timestamp: new Date(),
      details: { category: staff.category, email: staff.emailAddress }
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }
  // Redirect based on category
  const redirectMap = {
    'Triage': '/triagedashboard',
    'Admission': '/admissiondashboard',
    'Out Patient Department': '/opddashboard',
    'Emergency Department': '/emergencydashboard',
    'Billing': '/billingdashboard',
    'Cashier': '/cashierdashboard',
    'Admin': '/dashboard'
  };
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Send OTP to user's email
    const transporter = require('../utils/mailer');
    try {
      await transporter.sendMail({
        from: 'raycharlesvalino1993@gmail.com',
        to: staff.emailAddress,
        subject: 'Your OsLAMIB Login OTP',
        text: `Your OTP code is: ${otp}`
      });
    } catch (e) {
      console.error('Error sending OTP email:', e);
      // Optionally, you can show an error message on the OTP page
      return res.render('otp', { username: staff.username, error: 'Failed to send OTP email. Please contact support.' });
    }

    // Show OTP input page after successful login
    res.render('otp', { username: staff.username });
});

module.exports = router;

// OTP verification route
router.post('/verify-otp', async (req, res) => {
  const { otp, username } = req.body;
  // Check if OTP is present in session and not expired
  if (!req.session.otp || !req.session.otpExpires || Date.now() > req.session.otpExpires) {
    return res.render('otp', { username, error: 'OTP expired. Please log in again.' });
  }
  if (otp !== req.session.otp) {
    return res.render('otp', { username, error: 'Invalid OTP. Please try again.' });
  }
  // OTP is valid, clear OTP from session
  req.session.otp = null;
  req.session.otpExpires = null;
  // Redirect to dashboard based on category
  const redirectMap = {
    'Triage': '/triagedashboard',
    'Admission': '/admissiondashboard',
    'Out Patient Department': '/opddashboard',
    'Emergency Department': '/emergencydashboard',
    'Billing': '/billingdashboard',
    'Cashier': '/cashierdashboard',
    'Admin': '/dashboard'
  };
  const redirectUrl = redirectMap[req.session.category] || '/dashboard';
  res.redirect(redirectUrl);
});
