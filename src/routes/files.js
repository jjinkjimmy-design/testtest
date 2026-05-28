const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getBaseUrl } = require('../lib/url');
const {
  getAllFiles, getFileById, getFileByHash, insertFile, updateFileVersion,
  renameFile, updateFileSettings, deleteFileRecord, bulkDeleteFiles, logUpload, UPLOADS_DIR
} = require('../db');

const router = express.Router();
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({ storage, limits: { fileSize: MAX_MB * 1024 * 1024 } });

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function parseDuration(str) {
  const map = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000, '3d': 259200000, '7d': 604800000, '30d': 2592000000 };
  return map[str] || null;
}

// GET all files
router.get('/', requireAuth, (req, res) => {
  const files = getAllFiles(req.query.folder);
  const baseUrl = getBaseUrl(req);
  res.json(files.map(f => ({
    ...f,
    shareUrl: `${baseUrl}/d/${f.share_token}`,
    isExpired: !!(f.expires_at && f.expires_at < Date.now())
  })));
});

// Upload new file
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const filePath = path.join(UPLOADS_DIR, req.file.filename);
  const hash = await hashFile(filePath);

  // Duplicate detection
  const duplicate = getFileByHash(hash);
  if (duplicate && req.body.allow_duplicate !== 'true') {
    fs.unlinkSync(filePath);
    const baseUrl = getBaseUrl(req);
    return res.status(409).json({
      duplicate: true,
      existing: { ...duplicate, shareUrl: `${baseUrl}/d/${duplicate.share_token}` }
    });
  }

  const { expires_in, max_downloads, notes, folder_id } = req.body;
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
    notes: notes || null,
    folder_id: folder_id || null,
    file_hash: hash,
    version: 1
  };

  insertFile(fileRecord);
  logUpload(fileRecord.id, fileRecord.original_name, fileRecord.size);

  const baseUrl = getBaseUrl(req);
  res.json({ success: true, file: { ...fileRecord, shareUrl: `${baseUrl}/d/${fileRecord.share_token}` } });
});

// Upload new version of existing file
router.post('/:id/version', requireAuth, upload.single('file'), async (req, res) => {
  const existing = getFileById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'File not found' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const filePath = path.join(UPLOADS_DIR, req.file.filename);
  const hash = await hashFile(filePath);

  // Delete old file from disk
  const oldPath = path.join(UPLOADS_DIR, existing.stored_name);
  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

  // Update record in place (keeps share_token)
  updateFileVersion(existing.id, {
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    mime_type: req.file.mimetype,
    size: req.file.size,
    file_hash: hash,
    version: (existing.version || 1) + 1
  });

  logUpload(existing.id, req.file.originalname, req.file.size);
  res.json({ success: true });
});

// Rename file
router.patch('/:id/rename', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  renameFile(file.id, name.trim());
  res.json({ success: true });
});

// Update settings (expiry, max_downloads, notes, folder)
router.patch('/:id', requireAuth, (req, res) => {
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const { expires_in, max_downloads, notes, folder_id } = req.body;
  let expires_at = file.expires_at;
  if (expires_in !== undefined) {
    expires_at = (expires_in === 'never' || !expires_in) ? null : (Date.now() + (parseDuration(expires_in) || 0));
  }

  updateFileSettings(file.id, {
    expires_at,
    max_downloads: max_downloads !== undefined ? (max_downloads ? parseInt(max_downloads) : null) : file.max_downloads,
    notes: notes !== undefined ? notes : file.notes,
    folder_id: folder_id !== undefined ? (folder_id || null) : file.folder_id
  });
  res.json({ success: true });
});

// Delete single file
router.delete('/:id', requireAuth, (req, res) => {
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  const fp = path.join(UPLOADS_DIR, file.stored_name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  deleteFileRecord(file.id);
  res.json({ success: true });
});

// Bulk delete
router.post('/bulk-delete', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No IDs provided' });

  for (const id of ids) {
    const file = getFileById(id);
    if (file) {
      const fp = path.join(UPLOADS_DIR, file.stored_name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  }
  bulkDeleteFiles(ids);
  res.json({ success: true, deleted: ids.length });
});

module.exports = router;
