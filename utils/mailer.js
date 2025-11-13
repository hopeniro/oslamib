const nodemailer = require('nodemailer');

// Configure your SMTP transport (use your real credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'raycharlesvalino1993@gmail.com',
    pass: 'posgcqddgymlmivv'
  }
});

module.exports = transporter;
