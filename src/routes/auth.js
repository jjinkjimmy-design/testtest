const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  const validUser = process.env.VAULT_USERNAME || 'admin';
  const validPass = process.env.VAULT_PASSWORD || 'changeme123';

  if (username === validUser && password === validPass) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

module.exports = router;
