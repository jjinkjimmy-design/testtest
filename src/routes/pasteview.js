const express = require('express');
const { getPasteByToken, incrementPasteViews, deletePasteRecord } = require('../db');

const router = express.Router();

const LANGUAGES = ['plaintext','javascript','typescript','python','java','c','cpp','csharp','go','rust','php','ruby','swift','kotlin','bash','sql','html','css','json','yaml','markdown','xml'];

router.get('/:token', (req, res) => {
  const paste = getPasteByToken(req.params.token);
  if (!paste) return res.status(404).send(errorPage('Paste not found or has expired.'));
  if (paste.expires_at && paste.expires_at < Date.now()) {
    deletePasteRecord(paste.id);
    return res.status(410).send(errorPage('This paste has expired and been deleted.'));
  }

  incrementPasteViews(req.params.token);
  const isBurn = paste.burn_after_read === 1;
  if (isBurn) deletePasteRecord(paste.id);

  res.send(pastePage(paste, isBurn));
});

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function errorPage(msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vault</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Syne:wght@700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#080810;color:#e0e0f0;font-family:'Syne',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{text-align:center;padding:3rem}.icon{font-size:3rem;opacity:.4;margin-bottom:1.5rem}h1{font-family:'DM Mono',monospace;font-size:.9rem;color:#ff6b6b;letter-spacing:.1em;margin-bottom:.75rem}p{color:#666;font-size:.875rem}</style></head>
<body><div class="box"><div class="icon">📋</div><h1>PASTE UNAVAILABLE</h1><p>${msg}</p></div></body></html>`;
}

function pastePage(paste, wasBurn) {
  const expiryText = paste.expires_at ? `Expires ${new Date(paste.expires_at).toLocaleString()}` : 'No expiry';
  const lang = paste.language || 'plaintext';
  const escaped = paste.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lineCount = paste.content.split('\n').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vault — ${paste.title || 'Untitled Paste'}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#080810;--surface:#0f0f1a;--surface2:#13131f;--border:#1e1e32;--text:#e0e0f0;--muted:#5a5a8a;--accent:#7c6af7}
body{background:var(--bg);color:var(--text);font-family:'Syne',sans-serif;min-height:100vh}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.brand{font-size:1.1rem;font-weight:800;color:var(--text)}
.brand em{font-style:normal;color:var(--accent)}
.meta{display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
.meta-item{font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);letter-spacing:.08em}
.btn-copy{padding:.5rem 1rem;background:var(--accent);border:none;border-radius:8px;color:#fff;font-family:'DM Mono',monospace;font-size:.75rem;letter-spacing:.05em;cursor:pointer;transition:background .15s}
.btn-copy:hover{background:#6a58e5}
.burn-banner{background:rgba(255,107,107,.08);border-bottom:1px solid rgba(255,107,107,.2);padding:.6rem 2rem;font-family:'DM Mono',monospace;font-size:.72rem;color:#ff6b6b;letter-spacing:.08em;text-align:center}
.title-bar{padding:1.25rem 2rem .75rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:1rem}
h1{font-size:1.1rem;font-weight:700;letter-spacing:-.01em}
.lang-badge{font-family:'DM Mono',monospace;font-size:.68rem;padding:.2rem .6rem;background:rgba(124,106,247,.12);color:var(--accent);border:1px solid rgba(124,106,247,.2);border-radius:5px;letter-spacing:.05em}
.code-wrap{position:relative}
.line-nums{position:absolute;top:0;left:0;padding:1.25rem .75rem;font-family:'DM Mono',monospace;font-size:.82rem;line-height:1.6;color:#3a3a5a;text-align:right;user-select:none;border-right:1px solid var(--border);width:3.5rem}
pre{margin:0;padding:1.25rem 1.25rem 1.25rem 4.25rem!important;overflow-x:auto;background:var(--bg)!important;border-radius:0!important}
pre code{font-family:'DM Mono',monospace!important;font-size:.83rem!important;line-height:1.65!important;background:transparent!important}
.hljs{background:transparent!important}
footer{padding:1.25rem 2rem;border-top:1px solid var(--border);font-family:'DM Mono',monospace;font-size:.68rem;color:var(--muted);letter-spacing:.05em;display:flex;justify-content:space-between}
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">V<em>ault</em> / paste</div>
  <div class="meta">
    <span class="meta-item">VIEWS: ${paste.view_count + 1}</span>
    <span class="meta-item">${expiryText.toUpperCase()}</span>
    <span class="meta-item">${lineCount} LINES</span>
    ${wasBurn ? '<span class="meta-item" style="color:#ff6b6b">🔥 BURNED</span>' : ''}
  </div>
  <button class="btn-copy" onclick="copyPaste()">Copy</button>
</div>
${wasBurn ? '<div class="burn-banner">🔥 This was a burn-after-read paste — it has been deleted from the server</div>' : ''}
<div class="title-bar">
  <h1>${paste.title || 'Untitled Paste'}</h1>
  <span class="lang-badge">${lang}</span>
</div>
<div class="code-wrap">
  <div class="line-nums">${Array.from({length: lineCount}, (_, i) => i + 1).join('\n')}</div>
  <pre><code class="language-${lang}" id="codeBlock">${escaped}</code></pre>
</div>
<footer>
  <span>Created ${timeAgo(paste.created_at)}</span>
  <span>Vault · Secure File Sharing</span>
</footer>
<script>
hljs.highlightAll();
function copyPaste() {
  navigator.clipboard.writeText(${JSON.stringify(paste.content)}).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = '✓ Copied';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}
</script>
</body></html>`;
}

module.exports = router;
