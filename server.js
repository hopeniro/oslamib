const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const OnHold = require('./models/OnHold');
const Patient = require('./models/patient');
const router = express.Router();
const Doctor = require('./models/Doctor'); // Adjust path as needed
const Specialty = require('./models/Specialty');
const DoctorService = require('./models/DoctorService');
const Staff = require('./models/Staff');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Make io accessible to routes
app.set('io', io);

// Session middleware
app.use(session({
  secret: 'oslamhospital-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/oslam');
const categoryRoutes = require('./routes/categoryRoutes'); // adjust path
app.use('/', categoryRoutes);


const opdRoutes = require('./routes/opdRoutes'); // adjust path as needed
app.use('/', opdRoutes); // mount to root or change prefix as needed


const emergencyRoutes = require('./routes/emergencyRoutes');
app.use('/', emergencyRoutes);

const radiologyRoutes = require('./routes/radiologyRoutes');
app.use('/', radiologyRoutes);

const labRoutes = require('./routes/labRoutes');
app.use('/', labRoutes);

const admittingListRoutes = require('./routes/admittingList');
app.use('/', admittingListRoutes);


const nurseschedRoutes = require('./routes/nurseschedRoutes');
app.use('/', nurseschedRoutes); // Or a different base path

const nurseRoutes = require('./routes/nurseRoutes');
app.use('/', nurseRoutes);

const staffRoutes = require('./routes/staffRoutes');
app.use('/', staffRoutes);

const medicalRoutes = require('./routes/medicalRoutes');
app.use('/', medicalRoutes);


const doctorRoutes = require('./routes/doctorRoutes');
app.use('/', doctorRoutes); // This will allow /doctorscheduling to work



const patientRoutes = require('./routes/patientRoutes');
app.use('/', patientRoutes);

const audittrailRoutes = require('./routes/audittrailRoutes');
app.use('/audittrail', audittrailRoutes);



const notificationRoutes = require('./routes/notificationRoutes');
app.use('/', notificationRoutes);


const admissionRecordsRoutes = require('./routes/admissionRecordsRoutes');
app.use('/', admissionRecordsRoutes);

const admissionRoutes = require('./routes/admissionRoutes');
app.use('/', admissionRoutes);

const admittedPatientRoutes = require('./routes/admittedPatientRoutes');
app.use('/', admittedPatientRoutes);

const onholdRoutes = require('./routes/onholdRoutes');
app.use('/', onholdRoutes);

const billingRoutes = require('./routes/billingRoutes');
app.use('/', billingRoutes);

const cashierRoutes = require('./routes/cashierRoutes');
app.use('/', cashierRoutes);

const promissoryRoutes = require('./routes/promissoryRoutes');
app.use('/', promissoryRoutes);

// Dashboard route
app.get('/dashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    // Get date range from query params
    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      // Treat input dates as Philippines local dates and convert exact bounds to UTC
      // Example: 2025-11-04 (PH) => UTC range [2025-11-03T16:00:00Z, 2025-11-04T15:59:59.999Z]
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      // Default to last 30 days (Philippines time)
      // Compute PH today bounds, then convert to UTC
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    console.log('Dashboard date range (UTC):', startDate, 'to', endDate);
    
    // Get stats scoped to selected date range (Philippines time already handled above)
    // Patients registered within range
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    // Discharged patients within range (used for admissions + revenue/expenses)
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    console.log('Total admissions:', await Admission.countDocuments());
    console.log('Discharged patients:', dischargedPatients.length);
    
    const totalAdmissions = dischargedPatients.length;
    const opdPatients = await Patient.countDocuments({ 
      category: 'Out Patient Department',
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    const emergencyPatients = await Patient.countDocuments({ 
      category: 'Emergency',
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    // Scope pending billing to range using an assumed createdAt/updatedAt if available; fallback to all
    let pendingBilling = 0;
    try {
      pendingBilling = await Transaction.countDocuments({ status: 'For Billing', createdAt: { $gte: startDate, $lte: endDate } });
    } catch (_) {
      pendingBilling = await Transaction.countDocuments({ status: 'For Billing' });
    }
    // OnHold may not have date fields; keep as overall count
    const onHold = await OnHold.countDocuments();

    // Calculate expenses and income from discharged patients' transactions
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              
              // If procedureAmount exists, add to net income
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              
              // If itemAmount exists, add to expenses
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              
              // If both are null/0, use the amount field as net income
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    // Total Revenue = Net Income + Expenses
    const totalRevenue = totalNetIncome + totalExpenses;
    
  console.log('Expenses:', totalExpenses, 'Net Income:', totalNetIncome, 'Total Revenue:', totalRevenue);

    // For demo purposes, set trends and other stats
    const stats = {
      totalPatients,
      patientsTrend: 0, // Calculate based on last month comparison
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

  // Prepare detailed transactions for table (within the date range)
    const transactions = [];
    const revenueByDate = {}; // YYYY-MM-DD (PH) -> revenue sum
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              // If both are 0, use the amount field
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              // Revenue bucket by PH local date
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    // Build line chart data: date range registered vs discharged
    // Aggregate registered patients by registrationDate
    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Aggregate discharged patients by dischargedAt
    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('Registered aggregation:', JSON.stringify(registeredAgg));
    console.log('Discharged aggregation:', JSON.stringify(dischargedAgg));

    // Build continuous date labels for the range
    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

  // Daily revenue series aligned to labels
  const revenueSeries = labels.map(key => revenueByDate[key] || 0);

  const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    // Department distribution from discharged patients within the date range
    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('dashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

app.get('/triagedashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    // Get date range from query params
    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('triagedashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Triage Dashboard error:', error);
    res.status(500).send('Error loading triage dashboard');
  }
});

app.get('/admissiondashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('admissiondashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Admission Dashboard error:', error);
    res.status(500).send('Error loading admission dashboard');
  }
});

app.get('/opddashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('opddashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('OPD Dashboard error:', error);
    res.status(500).send('Error loading OPD dashboard');
  }
});

app.get('/emergencydashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('emergencydashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Emergency Dashboard error:', error);
    res.status(500).send('Error loading Emergency dashboard');
  }
});

app.get('/billingdashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('billingdashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Billing Dashboard error:', error);
    res.status(500).send('Error loading Billing dashboard');
  }
});

app.get('/cashierdashboard', async (req, res) => {
  try {
    const Patient = require('./models/patient');
    const Admission = require('./models/Admission');
    const DischargedPatient = require('./models/DischargedPatient');
    const Transaction = require('./models/Transaction');
    const OnHold = require('./models/OnHold');

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      const startLocal = moment(`${req.query.startDate} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const endLocal = moment(`${req.query.endDate} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      startDate = startLocal.utc().toDate();
      endDate = endLocal.utc().toDate();
    } else {
      const todayPHStart = moment(`${moment().format('YYYY-MM-DD')} 00:00:00 +08:00`, 'YYYY-MM-DD HH:mm:ss Z');
      const todayPHEnd = moment(`${moment().format('YYYY-MM-DD')} 23:59:59.999 +08:00`, 'YYYY-MM-DD HH:mm:ss.SSS Z');
      endDate = todayPHEnd.utc().toDate();
      startDate = todayPHStart.clone().subtract(29, 'days').utc().toDate();
    }
    
    const totalPatients = await Patient.countDocuments({
      registrationDate: { $gte: startDate, $lte: endDate }
    });
    
    const dischargedPatients = await DischargedPatient.find({
      dischargedAt: { $gte: startDate, $lte: endDate }
    });
    
    const totalAdmissions = dischargedPatients.length;
    
    let totalExpenses = 0;
    let totalNetIncome = 0;
    
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              if (service.procedureAmount) {
                totalNetIncome += service.procedureAmount * qty;
              }
              if (service.itemAmount) {
                totalExpenses += service.itemAmount * qty;
              }
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalNetIncome += service.amount * qty;
              }
            });
          }
        });
      }
    });

    const totalRevenue = totalNetIncome + totalExpenses;
    
    const stats = {
      totalPatients,
      patientsTrend: 0,
      totalAdmissions,
      admissionsTrend: 0,
      totalRevenue,
      revenueTrend: 0,
      netIncome: totalNetIncome,
      incomeTrend: 0,
      expenses: totalExpenses,
      expensesTrend: 0,
      outstandingExpenses: 0
    };

    const transactions = [];
    const revenueByDate = {};
    dischargedPatients.forEach(discharged => {
      if (discharged.transactions && Array.isArray(discharged.transactions)) {
        discharged.transactions.forEach(transaction => {
          if (transaction.services && Array.isArray(transaction.services)) {
            transaction.services.forEach(service => {
              const qty = service.qty || 1;
              const itemAmount = (service.itemAmount || 0) * qty;
              const procedureAmount = (service.procedureAmount || 0) * qty;
              let totalAmount = itemAmount + procedureAmount;
              
              if (!service.procedureAmount && !service.itemAmount && service.amount) {
                totalAmount = service.amount * qty;
              }
              
              const revenueKey = moment(discharged.dischargedAt).utcOffset(8).format('YYYY-MM-DD');
              revenueByDate[revenueKey] = (revenueByDate[revenueKey] || 0) + (totalAmount || 0);

              transactions.push({
                date: discharged.dischargedAt,
                patientName: discharged.fullName,
                description: service.description || service.serviceType || 'N/A',
                itemAmount: itemAmount,
                procedureAmount: procedureAmount || ((!service.itemAmount && service.amount) ? service.amount * qty : 0),
                totalAmount: totalAmount || (service.amount * qty) || 0
              });
            });
          }
        });
      }
    });

    const registeredAgg = await Patient.aggregate([
      { $match: { registrationDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dischargedAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dischargedAt', timezone: '+08:00' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const labels = [];
    const labelIndex = {};
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end, 'day')) {
      const key = current.format('YYYY-MM-DD');
      labels.push(key);
      labelIndex[key] = labels.length - 1;
      current.add(1, 'day');
    }

    const registeredCounts = new Array(labels.length).fill(0);
    const dischargedCounts = new Array(labels.length).fill(0);

    registeredAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) registeredCounts[labelIndex[row._id]] = row.count;
    });
    dischargedAgg.forEach(row => {
      if (labelIndex[row._id] !== undefined) dischargedCounts[labelIndex[row._id]] = row.count;
    });

    const revenueSeries = labels.map(key => revenueByDate[key] || 0);
    const chartData = { labels, registeredCounts, dischargedCounts, revenueSeries };

    const deptAgg = await mongoose.model('DischargedPatient').aggregate([
      { $match: { dischargedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { 
          _id: {
            $cond: [
              { $or: [ { $eq: ['$department', null] }, { $eq: ['$department', ''] } ] },
              'Unspecified',
              '$department'
            ]
          },
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    const departmentData = {
      labels: deptAgg.map(d => d._id || 'Unknown'),
      counts: deptAgg.map(d => d.count)
    };

    res.render('cashierdashboard', {
      stats,
      transactions,
      chartData,
      departmentData,
      username: req.session.username,
      emailAddress: req.session.emailAddress
    });
  } catch (error) {
    console.error('Cashier Dashboard error:', error);
    res.status(500).send('Error loading Cashier dashboard');
  }
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Login page (GET)
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null, success: null });
});

// Login submission (POST)
const loginRoutes = require('./routes/loginRoutes');
app.use('/', loginRoutes);

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Root route redirects to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Keep a single root redirect. If you want a different landing page, change the path below.
  // app.get('/', (req, res) => { res.redirect('/services'); });
  router.get('/doctors', (req, res) => {
    res.redirect('/doctor');
  });
  

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected to billing notifications');
  socket.on('disconnect', () => {
    console.log('Client disconnected from billing notifications');
  });
});

// Start server with PORT env override and auto-fallback if port is in use
let currentPort = parseInt(process.env.PORT, 10) || 3000;
let retries = 0;
const MAX_RETRIES = 5;

function listen(port) {
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && retries < MAX_RETRIES) {
    console.warn(`Port ${currentPort} is in use. Retrying on ${currentPort + 1}...`);
    retries += 1;
    currentPort += 1;
    setTimeout(() => listen(currentPort), 250);
  } else {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
});

listen(currentPort);

// HRN generator for OnHold and patients — format YY-00-00-XX where XX increments
async function generateHRNForOnHold() {
  const yy = moment().format('YY');
  const prefix = `${yy}-00-00-`;

  // Find latest in Patients and OnHold
  const lastPatient = await Patient.findOne({ patientId: { $regex: `^${prefix}` } }).sort({ patientId: -1 }).exec().catch(()=>null);
  const lastOnHold = await OnHold.findOne({ tempId: { $regex: `^${prefix}` } }).sort({ tempId: -1 }).exec().catch(()=>null);

  let lastSeq = 0;
  if (lastPatient && lastPatient.patientId) {
    const p = lastPatient.patientId.split('-');
    const n = parseInt(p[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }
  if (lastOnHold && lastOnHold.tempId) {
    const p = lastOnHold.tempId.split('-');
    const n = parseInt(p[3], 10);
    if (!isNaN(n)) lastSeq = Math.max(lastSeq, n);
  }

  const next = String(lastSeq + 1).padStart(2, '0');
  return `${prefix}${next}`;
}
  
  app.get('/onhold-list', async (req, res) => {
    try {
      const onHolds = await OnHold.find();
      res.render('onholdList', { onHolds });
    } catch (err) {
      res.status(500).send('Failed to fetch on-hold patients');
    }
  });

  app.get('/patient-from-onhold/:id', async (req, res) => {
    try {
      const hold = await OnHold.findById(req.params.id);
      res.render('patient', { error: null, hold }); // ✅ error is passed
    } catch (err) {
      res.status(404).send('OnHold patient not found');
    }
  });
  
  app.get('/patient', async (req, res) => {
    const hold = req.query.onHoldId ? await OnHold.findById(req.query.onHoldId) : null;
    res.render('patient', { error: null, hold }); // ✅ error is passed
  });
  
  app.get('/onholdlist', (req, res) => {
    res.redirect('/onhold-list');
  });
  
  const TransactionType = require('./models/TransactionType');

// Show services page
app.get('/services', async (req, res) => {
  const transactionTypes = await TransactionType.find();
  res.render('services', { transactionTypes });
});

// Add a transaction type
app.post('/add-transaction-type', async (req, res) => {
  const { type } = req.body;
  const exists = await TransactionType.findOne({ type });
  if (!exists) {
    await TransactionType.create({ type, services: [] });
  }
  res.redirect('/services');
});

// Add services under a transaction type
app.post('/add-service', async (req, res) => {
  const { type, descriptions, procedureAmounts, itemUsed, itemAmounts, totalAmounts } = req.body;

  const services = descriptions.map((desc, i) => ({
    description: desc,
    procedureAmount: procedureAmounts[i] || null,
    itemUsed: itemUsed[i] || null,
    itemAmount: itemAmounts[i] || null,
    amount: totalAmounts[i]
  }));

  await TransactionType.findOneAndUpdate(
    { type },
    { $push: { services: { $each: services } } }
  );

  res.redirect('/services');
});

app.get('/services/:transactionType', async (req, res) => {
    const { transactionType } = req.params;
    try {
      // Find the transaction type and fetch its services
      const transaction = await TransactionType.findOne({ type: transactionType });
      
      if (!transaction) {
        return res.status(404).send('Transaction Type not found');
      }
  
      // Return the services of the found transaction type
      res.json(transaction.services);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching services');
    }
  });
  app.delete('/delete-service/:serviceId', async (req, res) => {
    const { serviceId } = req.params;
    
    try {
      // Find the transaction type containing the service
      const transaction = await TransactionType.findOne({ "services._id": serviceId });
  
      if (!transaction) {
        return res.status(404).send('Service not found');
      }
  
      // Remove the service from the services array
      const serviceIndex = transaction.services.findIndex(service => service._id.toString() === serviceId);
      
      if (serviceIndex > -1) {
        transaction.services.splice(serviceIndex, 1); // Remove service by index
        await transaction.save(); // Save the updated transaction
        res.send('Service deleted');
      } else {
        res.status(404).send('Service not found in this transaction type');
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error deleting service');
    }
  });
  
  // Update a service
app.put('/update-service/:serviceId', async (req, res) => {
    const { serviceId } = req.params;
    const { description, procedureAmount, itemUsed, itemAmount, amount } = req.body;
  
    try {
      const transaction = await TransactionType.findOne({ "services._id": serviceId });
  
      if (!transaction) {
        return res.status(404).send('Service not found');
      }
  
      const service = transaction.services.id(serviceId);
      service.description = description;
      service.procedureAmount = procedureAmount || null;
      service.itemUsed = itemUsed || null;
      service.itemAmount = itemAmount || null;
      service.amount = amount;
      
      await transaction.save();
      res.send('Service updated');
    } catch (err) {
      res.status(500).send('Error updating service');
    }
  });
  
  // Render doctor registration form
router.get('/doctor', async (req, res) => {
  try {
    const specialties = await Specialty.find();
    const services = await DoctorService.find();
    const doctors = await Doctor.find();

    // Compute effective status similar to nurses
    const today = new Date();
    const doctorsWithStatus = doctors.map(d => {
      const obj = d.toObject();
      const isExpired = obj.validUntil && new Date(obj.validUntil) < today;
      const baseStatus = obj.status || 'active';
      obj.effectiveStatus = isExpired ? 'expired' : baseStatus;
      obj.canChangeStatus = !isExpired;
      return obj;
    });

    res.render('doctor', { specialties, services, doctors: doctorsWithStatus });
  } catch (error) {
    res.status(500).send('Error loading doctor page: ' + error.message);
  }
});

function generateDoctorId() {
  const year = new Date().getFullYear();
  const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase(); // e.g. 'ABC12'
  return `DOC${year}${randomStr}`;
}

router.post('/register-doctor', async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, birthday, gender, contact, address, email,
      specialties, services, licenseNumber, validUntil
    } = req.body;

    // Basic validation
    const contactOk = /^\d{11}$/.test((contact || '').trim());
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
    if (!contactOk) return res.status(400).send('Invalid contact number. It must be exactly 11 digits.');
    if (!emailOk) return res.status(400).send('Invalid email format.');

    // Normalize arrays
    const safeSpecialties = Array.isArray(specialties)
      ? specialties.filter(Boolean)
      : (specialties ? [specialties] : []);
    const safeServices = Array.isArray(services)
      ? services.filter(Boolean)
      : (services ? [services] : []);

    const doctor = new Doctor({
      doctorId: generateDoctorId(),
      firstName,
      middleName,
      lastName,
      birthday,
      gender,
      contact,
      address,
      email,
      licenseNumber,
      validUntil,
      specialties: safeSpecialties,
      services: safeServices,
      status: 'active'
    });

    await doctor.save();
    res.redirect('/doctor');
  } catch (error) {
    res.status(500).send('Error registering doctor: ' + error.message);
  }
});

// Toggle doctor status (active/inactive) with license guard
router.post('/toggle-doctor-status', async (req, res) => {
  try {
    const { doctorId, status } = req.body;
    const doctor = await Doctor.findOne({ doctorId });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const today = new Date();
    const isExpired = doctor.validUntil && new Date(doctor.validUntil) < today;
    if (isExpired && status === 'active') {
      return res.status(400).json({ error: 'Cannot activate doctor with expired license' });
    }

    doctor.status = status;
    await doctor.save();
    res.json({ success: true, status: doctor.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});


// Optional: Add service
router.post('/add-doctor-service', async (req, res) => {
  try {
    const newService = new DoctorService({ service: req.body.service });
    await newService.save();
    res.redirect('/doctor');
  } catch (error) {
    res.status(500).send('Error adding service: ' + error.message);
  }
});

// Optional: Add specialty
router.post('/add-specialty', async (req, res) => {
  try {
    const newSpecialty = new Specialty({ specialty: req.body.specialty });
    await newSpecialty.save();
    res.redirect('/doctor');
  } catch (error) {
    res.status(500).send('Error adding specialty: ' + error.message);
  }
});

app.use('/', router);