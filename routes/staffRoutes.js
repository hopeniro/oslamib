const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const bcrypt = require('bcrypt');

// Register staff
router.post('/register-staff', async (req, res) => {
  const { firstName, middleName, lastName, dateOfBirth, gender, civilStatus, nationality, contactNumber, emailAddress, homeAddress } = req.body;

  // Basic server-side validation
  const contactOk = /^\d{11}$/.test((contactNumber || '').trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((emailAddress || '').trim());
  if (!contactOk) {
    return res.status(400).send('Invalid contact number. It must be exactly 11 digits.');
  }
  if (!emailOk) {
    return res.status(400).send('Invalid email format.');
  }

  // Generate staff ID in format STF-250001
  const staffId = await Staff.generateStaffId();

  await Staff.create({
    staffId,
    firstName,
    middleName,
    lastName,
    dateOfBirth,
    gender,
    civilStatus,
    nationality,
    contactNumber,
    emailAddress,
    homeAddress,
    status: 'active'
  });

  res.redirect('/staff');
});

// GET staff management page
router.get('/staff', async (req, res) => {
  const staff = await Staff.find().sort({ staffId: 1 });
  res.render('staff.ejs', { staff });
});

// Manage staff (update category and status)
router.post('/manage-staff', async (req, res) => {
  try {
    const { staffId, category, username, password, statusToggle } = req.body;
    const staff = await Staff.findOne({ staffId });
    
    if (!staff) {
      return res.status(404).send('Staff not found');
    }
    
    staff.category = category;
    staff.username = username;
    
    // Only update password if provided
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      staff.password = hashedPassword;
    }
    
    staff.status = statusToggle === 'on' ? 'active' : 'inactive';
    await staff.save();
    
    res.redirect('/staff');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update staff');
  }
});

// Update staff details
router.post('/update-staff', async (req, res) => {
  try {
    const { staffId, firstName, middleName, lastName, dateOfBirth, gender, civilStatus, nationality, contactNumber, emailAddress, homeAddress } = req.body;
    
    // Basic server-side validation
    const contactOk = /^\d{11}$/.test((contactNumber || '').trim());
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((emailAddress || '').trim());
    if (!contactOk) {
      return res.status(400).send('Invalid contact number. It must be exactly 11 digits.');
    }
    if (!emailOk) {
      return res.status(400).send('Invalid email format.');
    }
    
    const staff = await Staff.findOne({ staffId });
    if (!staff) {
      return res.status(404).send('Staff not found');
    }
    
    // Update fields
    staff.firstName = firstName;
    staff.middleName = middleName;
    staff.lastName = lastName;
    staff.dateOfBirth = dateOfBirth;
    staff.gender = gender;
    staff.civilStatus = civilStatus;
    staff.nationality = nationality;
    staff.contactNumber = contactNumber;
    staff.emailAddress = emailAddress;
    staff.homeAddress = homeAddress;
    
    await staff.save();
    res.redirect('/staff');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update staff details');
  }
});

// Delete staff
router.post('/delete-staff', async (req, res) => {
  try {
    const { staffId } = req.body;
    const result = await Staff.deleteOne({ staffId });
    
    if (result.deletedCount === 0) {
      return res.status(404).send('Staff not found');
    }
    
    res.redirect('/staff');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to delete staff');
  }
});

// Restore staff password to default "password"
router.post('/restore-staff-password', async (req, res) => {
  try {
    const { staffId } = req.body;
    const staff = await Staff.findOne({ staffId });
    
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }
    
    // Hash the default password "password"
    const hashedPassword = await bcrypt.hash('password', 10);
    staff.password = hashedPassword;
    await staff.save();
    
    res.json({ success: true, message: 'Password restored to default' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to restore password' });
  }
});

module.exports = router;
