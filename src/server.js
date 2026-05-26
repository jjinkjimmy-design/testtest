require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const { initDB, deleteExpiredFiles } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
initDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'vault-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/d', require('./routes/download'));

// Serve frontend
app.get('/', (req, res) => {
  if (req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Cron job: check for expired files every minute
cron.schedule('* * * * *', () => {
  deleteExpiredFiles();
});

app.listen(PORT, () => {
  console.log(`🔒 Vault running on port ${PORT}`);
});
