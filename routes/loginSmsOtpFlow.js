const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const bcrypt = require('bcrypt');
const twilio = require('twilio');

// Twilio config (replace with your credentials)
// TODO: Replace with your actual Twilio credentials
const accountSid = 'ACfcd78193a36661ac468cbe10dde65504'; // Your Twilio Account SID
const authToken = 'cf42da6caead45e06fc543145e2652db'; // Your Twilio Auth Token
const twilioPhone = '+13292170671'; // Your Twilio phone number
const client = twilio(accountSid, authToken);

// Step 1: Username & Password
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const staff = await Staff.findOne({ username });
  if (!staff || !staff.password) {
    return res.render('login.ejs', { error: 'Invalid username or password.' });
  }
  const match = await bcrypt.compare(password, staff.password);
  if (!match) {
    return res.render('login.ejs', { error: 'Invalid username or password.' });
  }
  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  req.session.staffId = staff.staffId;
  req.session.smsOtp = otp;
  req.session.smsOtpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
  // Send OTP via SMS
  try {
    await client.messages.create({
      body: `Your OsLAMIB login code is: ${otp}`,
      from: twilioPhone,
      to: staff.contactNumber
    });
    return res.render('login-sms-otp.ejs', { phone: staff.contactNumber });
  } catch (err) {
    console.error('Twilio SMS error:', err);
    let errorMsg = 'Failed to send SMS. Please try again.';
    if (err && err.message) {
      errorMsg += ' Twilio error: ' + err.message;
    }
    return res.render('login.ejs', { error: errorMsg });
  }
});

// Step 2: OTP Verification
router.post('/sms-otp/verify', async (req, res) => {
  const staffId = req.session.staffId;
  const { otp } = req.body;
  if (!staffId || !req.session.smsOtp) {
    return res.redirect('/login');
  }
  if (Date.now() > req.session.smsOtpExpires) {
    return res.render('login-sms-otp.ejs', { error: 'OTP expired. Please log in again.' });
  }
  if (otp === req.session.smsOtp) {
    req.session.smsOtp = null;
    req.session.smsOtpExpires = null;
    req.session.smsOtpVerified = true;
    return res.redirect('/dashboard');
  } else {
    return res.render('login-sms-otp.ejs', { error: 'Invalid code. Please try again.' });
  }
});

module.exports = router;
