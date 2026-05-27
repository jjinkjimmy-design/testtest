const express = require('express');
const path = require('path');
const fs = require('fs');
const { getFileByToken, incrementDownload, deleteFileRecord, logDownload, UPLOADS_DIR } = require('../db');

const router = express.Router();

function sendDiscordWebhook(file) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = {
    embeds: [{
      title: '📥 File Downloaded',
      color: 0x7c6af7,
      fields: [
        { name: 'File', value: file.original_name, inline: true },
        { name: 'Size', value: formatSize(file.size), inline: true },
        { name: 'Downloads', value: `${file.download_count + 1}${file.max_downloads ? '/' + file.max_downloads : ''}`, inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Vault · File Sharing' }
    }]
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('Discord webhook error:', err));
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function notFoundPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vault — Unavailable</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Syne:wght@700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#080810;color:#e0e0f0;font-family:'Syne',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{text-align:center;padding:3rem 2rem}.icon{font-size:3.5rem;margin-bottom:1.5rem;opacity:.4}h1{font-family:'DM Mono',monospace;font-size:1rem;color:#ff6b6b;letter-spacing:.1em;margin-bottom:.75rem}
p{color:#666;font-size:.9rem;line-height:1.7}</style></head>
<body><div class="box"><div class="icon">🔒</div><h1>FILE UNAVAILABLE</h1><p>${msg}</p></div></body></html>`;
}

router.get('/:token', (req, res) => {
  const file = getFileByToken(req.params.token);
  if (!file) return res.status(404).send(notFoundPage('File not found or link has expired.'));
  if (file.expires_at && file.expires_at < Date.now()) {
    const fp = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    deleteFileRecord(file.id);
    return res.status(410).send(notFoundPage('This file has expired and been deleted.'));
  }
  if (file.max_downloads && file.download_count >= file.max_downloads) {
    return res.status(410).send(notFoundPage('This file has reached its maximum download limit.'));
  }
  const fp = path.join(UPLOADS_DIR, file.stored_name);
  if (!fs.existsSync(fp)) {
    deleteFileRecord(file.id);
    return res.status(404).send(notFoundPage('File not found on server.'));
  }

  incrementDownload(req.params.token);
  logDownload(file.id, file.original_name);
  sendDiscordWebhook(file);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', file.size);
  fs.createReadStream(fp).pipe(res);
});

module.exports = router;
