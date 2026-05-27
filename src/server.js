require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const { initDB, deleteExpiredFiles } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'vault-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth routes
app.use('/auth', require('./routes/auth'));

// API routes (protected)
app.use('/api/files', require('./routes/files'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/pastes', require('./routes/pastes'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/qr', require('./routes/qr'));

// Public routes
app.use('/d', require('./routes/download'));
app.use('/p', require('./routes/pasteview'));

// Frontend pages
app.get('/', (req, res) => {
  if (req.session.authenticated) return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  res.redirect('/login');
});
app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

cron.schedule('* * * * *', () => deleteExpiredFiles());

app.listen(PORT, () => console.log(`🔒 Vault running on port ${PORT}`));
