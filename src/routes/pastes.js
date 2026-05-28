const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getBaseUrl } = require('../lib/url');
const { getAllPastes, getPasteById, insertPaste, updatePaste, deletePasteRecord } = require('../db');

const router = express.Router();

function parseDuration(str) {
  const map = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000, '3d': 259200000, '7d': 604800000, '30d': 2592000000 };
  return map[str] || null;
}

router.get('/', requireAuth, (req, res) => {
  const pastes = getAllPastes();
  const baseUrl = getBaseUrl(req);
  res.json(pastes.map(p => ({
    ...p,
    shareUrl: `${baseUrl}/p/${p.share_token}`,
    rawUrl:   `${baseUrl}/p/${p.share_token}/raw`
  })));
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
  const baseUrl = getBaseUrl(req);
  res.json({
    success: true,
    paste: {
      ...paste,
      shareUrl: `${baseUrl}/p/${paste.share_token}`,
      rawUrl:   `${baseUrl}/p/${paste.share_token}/raw`
    }
  });
});

router.patch('/:id', requireAuth, (req, res) => {
  const paste = getPasteById(req.params.id);
  if (!paste) return res.status(404).json({ error: 'Paste not found' });

  const { title, content, language, expires_in } = req.body;
  if (content !== undefined && !content.trim()) return res.status(400).json({ error: 'Content cannot be empty' });

  let expires_at = paste.expires_at;
  if (expires_in !== undefined) {
    if (expires_in === 'never' || !expires_in) {
      expires_at = null;
    } else {
      const ms = parseDuration(expires_in);
      expires_at = ms ? Date.now() + ms : null;
    }
  }

  updatePaste(paste.id, {
    title:      title      !== undefined ? (title.trim() || null) : paste.title,
    content:    content    !== undefined ? content.trim()          : paste.content,
    language:   language   !== undefined ? language                : paste.language,
    expires_at
  });

  res.json({ success: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const paste = getPasteById(req.params.id);
  if (!paste) return res.status(404).json({ error: 'Paste not found' });
  deletePasteRecord(paste.id);
  res.json({ success: true });
});

module.exports = router;
