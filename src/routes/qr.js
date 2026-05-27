const express = require('express');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.get('/', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: '#7c6af7', light: '#0f0f1a' } });
    res.json({ qr: dataUrl });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});
module.exports = router;
