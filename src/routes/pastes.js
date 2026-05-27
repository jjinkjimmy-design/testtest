const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getAllPastes, getPasteById, insertPaste, deletePasteRecord } = require('../db');

const router = express.Router();

function parseDuration(str) {
  const map = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000, '3d': 259200000, '7d': 604800000, '30d': 2592000000 };
  return map[str] || null;
}

router.get('/', requireAuth, (req, res) => {
  const pastes = getAllPastes();
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json(pastes.map(p => ({ ...p, shareUrl: `${baseUrl}/p/${p.share_token}` })));
});

router.post('/', requireAuth, (req, res) => {
  const { title, content, language, expires_in, burn_after_read } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });

  let expires_at = null;
  if (expires_in && expires_in !== 'never') {
    const ms = parseDuration(expires_in);
    if (ms) expires_at = Date.now() + ms;
  }

  const paste = {
    id: uuidv4(),
    title: title?.trim() || null,
    content: content.trim(),
    language: language || 'plaintext',
    share_token: uuidv4().replace(/-/g, ''),
    expires_at,
    created_at: Date.now(),
    burn_after_read: burn_after_read === 'true' || burn_after_read === true ? 1 : 0
  };

  insertPaste(paste);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ success: true, paste: { ...paste, shareUrl: `${baseUrl}/p/${paste.share_token}` } });
});

router.delete('/:id', requireAuth, (req, res) => {
  const paste = getPasteById(req.params.id);
  if (!paste) return res.status(404).json({ error: 'Paste not found' });
  deletePasteRecord(paste.id);
  res.json({ success: true });
});

module.exports = router;
