const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getAllFiles, insertFile, deleteFileRecord, getFileById, UPLOADS_DIR } = require('../db');

const router = express.Router();

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 }
});

// List all files
router.get('/', requireAuth, (req, res) => {
  const files = getAllFiles();
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const result = files.map(f => ({
    ...f,
    shareUrl: `${baseUrl}/d/${f.share_token}`,
    isExpired: f.expires_at && f.expires_at < Date.now()
  }));
  res.json(result);
});

// Upload file
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const { expires_in, max_downloads, notes } = req.body;

  let expires_at = null;
  if (expires_in && expires_in !== 'never') {
    const ms = parseDuration(expires_in);
    if (ms) expires_at = Date.now() + ms;
  }

  const fileRecord = {
    id: uuidv4(),
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    mime_type: req.file.mimetype,
    size: req.file.size,
    share_token: uuidv4().replace(/-/g, ''),
    max_downloads: max_downloads ? parseInt(max_downloads) : null,
    expires_at,
    created_at: Date.now(),
    notes: notes || null
  };

  insertFile(fileRecord);

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  res.json({
    success: true,
    file: {
      ...fileRecord,
      shareUrl: `${baseUrl}/d/${fileRecord.share_token}`
    }
  });
});

// Delete file
router.delete('/:id', requireAuth, (req, res) => {
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  deleteFileRecord(file.id);

  res.json({ success: true });
});

// Update expiry
router.patch('/:id', requireAuth, (req, res) => {
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const { expires_in, max_downloads, notes } = req.body;
  const db = require('../db');

  let expires_at = file.expires_at;
  if (expires_in !== undefined) {
    if (expires_in === 'never' || !expires_in) {
      expires_at = null;
    } else {
      const ms = parseDuration(expires_in);
      expires_at = ms ? Date.now() + ms : null;
    }
  }

  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || require('path').join(__dirname, '../../data/vault.db');
  const betterDb = new Database(dbPath);

  betterDb.prepare(`
    UPDATE files SET expires_at = ?, max_downloads = ?, notes = ? WHERE id = ?
  `).run(
    expires_at,
    max_downloads !== undefined ? (max_downloads ? parseInt(max_downloads) : null) : file.max_downloads,
    notes !== undefined ? notes : file.notes,
    file.id
  );

  res.json({ success: true });
});

function parseDuration(str) {
  const map = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000, '3d': 259200000, '7d': 604800000, '30d': 2592000000 };
  return map[str] || null;
}

module.exports = router;
