const express = require('express');
const path = require('path');
const fs = require('fs');
const { getFileByToken, incrementDownload, deleteFileRecord, UPLOADS_DIR } = require('../db');

const router = express.Router();

router.get('/:token', (req, res) => {
  const file = getFileByToken(req.params.token);

  if (!file) {
    return res.status(404).send(notFoundPage('File not found or link has expired.'));
  }

  // Check expiry
  if (file.expires_at && file.expires_at < Date.now()) {
    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteFileRecord(file.id);
    return res.status(410).send(notFoundPage('This file has expired and been deleted.'));
  }

  // Check max downloads
  if (file.max_downloads && file.download_count >= file.max_downloads) {
    return res.status(410).send(notFoundPage('This file has reached its maximum download limit.'));
  }

  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (!fs.existsSync(filePath)) {
    deleteFileRecord(file.id);
    return res.status(404).send(notFoundPage('File not found on server.'));
  }

  incrementDownload(req.params.token);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', file.size);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// Preview page before download
router.get('/:token/info', (req, res) => {
  const file = getFileByToken(req.params.token);
  if (!file) return res.status(404).send(notFoundPage('File not found.'));

  const expired = file.expires_at && file.expires_at < Date.now();
  const maxed = file.max_downloads && file.download_count >= file.max_downloads;

  if (expired || maxed) {
    return res.status(410).send(notFoundPage('This file is no longer available.'));
  }

  res.send(previewPage(file, req.params.token));
});

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function notFoundPage(msg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vault — File Unavailable</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #e0e0e8; font-family: 'DM Sans', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .box { text-align: center; padding: 3rem 2rem; }
  .icon { font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.5; }
  h1 { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: #ff6b6b; margin-bottom: 1rem; letter-spacing: 0.05em; }
  p { color: #888; font-size: 0.95rem; line-height: 1.6; }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">🔒</div>
    <h1>FILE UNAVAILABLE</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`;
}

function previewPage(file, token) {
  const expiryInfo = file.expires_at
    ? `Expires ${new Date(file.expires_at).toLocaleString()}`
    : 'No expiry';
  const dlInfo = file.max_downloads
    ? `${file.download_count}/${file.max_downloads} downloads used`
    : `${file.download_count} downloads`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vault — ${file.original_name}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #e0e0e8; font-family: 'DM Sans', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .card { background: #13131a; border: 1px solid #2a2a3a; border-radius: 16px; padding: 2.5rem; max-width: 480px; width: 100%; }
  .brand { font-family: 'DM Mono', monospace; font-size: 0.75rem; letter-spacing: 0.15em; color: #5a5a7a; margin-bottom: 2rem; text-transform: uppercase; }
  .brand span { color: #7c6af7; }
  .file-icon { font-size: 3rem; margin-bottom: 1rem; }
  h1 { font-size: 1.1rem; font-weight: 500; margin-bottom: 0.5rem; word-break: break-all; }
  .meta { display: flex; gap: 1.5rem; margin: 1.5rem 0; }
  .meta-item { font-family: 'DM Mono', monospace; font-size: 0.75rem; color: #666; }
  .meta-item span { display: block; color: #aaa; font-size: 0.85rem; margin-top: 0.2rem; }
  .notes { background: #0d0d14; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: #888; font-style: italic; }
  .btn { display: block; width: 100%; padding: 1rem; background: #7c6af7; color: white; border: none; border-radius: 10px; font-family: 'DM Mono', monospace; font-size: 0.9rem; letter-spacing: 0.05em; cursor: pointer; text-decoration: none; text-align: center; transition: background 0.2s; }
  .btn:hover { background: #6a58e5; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span>VAULT</span> / shared file</div>
    <div class="file-icon">📄</div>
    <h1>${file.original_name}</h1>
    <div class="meta">
      <div class="meta-item">SIZE<span>${formatSize(file.size)}</span></div>
      <div class="meta-item">EXPIRY<span>${expiryInfo}</span></div>
      <div class="meta-item">DOWNLOADS<span>${dlInfo}</span></div>
    </div>
    ${file.notes ? `<div class="notes">${file.notes}</div>` : ''}
    <a href="/d/${token}" class="btn">⬇ Download File</a>
  </div>
</body>
</html>`;
}

module.exports = router;
