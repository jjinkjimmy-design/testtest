const express = require('express');
const { getBaseUrl } = require('../lib/url');
const { getPasteByToken, incrementPasteViews, deletePasteRecord } = require('../db');

const router = express.Router();

// ── /p/:token/raw — plain text, no HTML ──────────────────────────────────────
router.get('/:token/raw', (req, res) => {
  const paste = getPasteByToken(req.params.token);
  if (!paste) return res.status(404).type('text/plain').send('Paste not found or has expired.');
  if (paste.expires_at && paste.expires_at < Date.now()) {
    deletePasteRecord(paste.id);
    return res.status(410).type('text/plain').send('This paste has expired and been deleted.');
  }
  // Burn-after-read also applies to raw — only increment view, don't delete
  // (deletion only on the rendered view so users can still copy from raw)
  res.type('text/plain').send(paste.content);
});

// ── /p/:token — rendered view ────────────────────────────────────────────────
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

  const baseUrl = getBaseUrl(req);
  res.send(pastePage(paste, isBurn, baseUrl));
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function fmtExpiry(ts) {
  if (!ts) return 'Never';
  const diff = ts - Date.now();
  if (diff <= 0) return 'Expired';
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d`;
  if (h > 0) return `in ${h}h`;
  return `in ${m}m`;
}

function errorPage(msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vault</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Syne:wght@700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#080810;color:#e0e0f0;font-family:'Syne',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{text-align:center;padding:3rem}.icon{font-size:3rem;opacity:.4;margin-bottom:1.5rem}
h1{font-family:'DM Mono',monospace;font-size:.9rem;color:#ff6b6b;letter-spacing:.1em;margin-bottom:.75rem}p{color:#666;font-size:.875rem}</style></head>
<body><div class="box"><div class="icon">📋</div><h1>PASTE UNAVAILABLE</h1><p>${msg}</p></div></body></html>`;
}

function pastePage(paste, wasBurn, baseUrl) {
  const token = paste.share_token;
  const rawUrl = `${baseUrl}/p/${token}/raw`;
  const lang = paste.language || 'plaintext';
  const escaped = paste.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lineCount = paste.content.split('\n').length;
  const charCount = paste.content.length;
  const expiryText = fmtExpiry(paste.expires_at);
  const sizeLabel = charCount > 1024 ? (charCount/1024).toFixed(1)+' KB' : charCount+' B';

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
:root{
  --bg:#080810;--surface:#0f0f1a;--surface2:#13131f;--surface3:#1a1a2e;
  --border:#1e1e32;--border2:#2a2a45;--text:#e0e0f0;--muted:#5a5a8a;
  --sub:#8080b0;--accent:#7c6af7;--danger:#ff6b6b;--success:#4ecb71;--warn:#f5a623;
}
body{background:var(--bg);color:var(--text);font-family:'Syne',sans-serif;min-height:100vh;display:flex;flex-direction:column}

/* ── Topbar ── */
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;flex-shrink:0}
.brand{font-size:1rem;font-weight:800;letter-spacing:-.02em;text-decoration:none;color:var(--text)}
.brand em{font-style:normal;color:var(--accent)}
.topbar-actions{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .875rem;border-radius:7px;font-family:'DM Mono',monospace;font-size:.72rem;letter-spacing:.04em;cursor:pointer;text-decoration:none;border:none;transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#6a58e5}
.btn-ghost{background:none;border:1px solid var(--border);color:var(--sub)}.btn-ghost:hover{border-color:var(--border2);color:var(--text)}
.btn-raw{background:rgba(78,203,113,.1);border:1px solid rgba(78,203,113,.25);color:var(--success)}.btn-raw:hover{background:rgba(78,203,113,.18)}
.btn-copy-inline{background:var(--accent-dim, rgba(124,106,247,.12));border:1px solid rgba(124,106,247,.25);color:var(--accent)}.btn-copy-inline:hover{background:rgba(124,106,247,.2)}

/* ── Meta bar ── */
.meta-bar{background:var(--surface2);border-bottom:1px solid var(--border);padding:.6rem 1.5rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap}
.meta-chip{font-family:'DM Mono',monospace;font-size:.67rem;color:var(--muted);letter-spacing:.07em;display:flex;align-items:center;gap:.35rem}
.meta-chip span{color:var(--sub)}
.lang-badge{padding:.2rem .55rem;background:rgba(124,106,247,.12);color:var(--accent);border:1px solid rgba(124,106,247,.2);border-radius:5px;font-family:'DM Mono',monospace;font-size:.65rem;letter-spacing:.06em}

/* ── Burn banner ── */
.burn-banner{background:rgba(255,107,107,.07);border-bottom:1px solid rgba(255,107,107,.18);padding:.55rem 1.5rem;font-family:'DM Mono',monospace;font-size:.7rem;color:var(--danger);letter-spacing:.08em;text-align:center}

/* ── Title bar ── */
.title-bar{padding:1rem 1.5rem .75rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:1rem}
.paste-title{font-size:1.05rem;font-weight:700;letter-spacing:-.01em;flex:1}

/* ── Code area ── */
.code-outer{flex:1;display:flex;overflow:auto}
.line-col{padding:1rem .75rem 1rem .5rem;background:var(--surface2);border-right:1px solid var(--border);font-family:'DM Mono',monospace;font-size:.8rem;line-height:1.65;color:#2e2e52;text-align:right;user-select:none;min-width:3.25rem;flex-shrink:0}
.code-col{flex:1;overflow-x:auto}
pre{margin:0;padding:1rem 1.25rem!important;background:var(--bg)!important;border-radius:0!important;min-height:100%}
pre code{font-family:'DM Mono',monospace!important;font-size:.8rem!important;line-height:1.65!important;background:transparent!important}
.hljs{background:transparent!important}

/* ── Footer ── */
.footer{background:var(--surface);border-top:1px solid var(--border);padding:.75rem 1.5rem;font-family:'DM Mono',monospace;font-size:.65rem;color:var(--muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;flex-shrink:0}

/* ── Toast ── */
.toast{position:fixed;bottom:1.5rem;right:1.5rem;background:var(--surface3);border:1px solid var(--border2);border-radius:8px;padding:.65rem 1rem;font-family:'DM Mono',monospace;font-size:.75rem;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:99;transform:translateY(60px);opacity:0;transition:all .25s cubic-bezier(.16,1,.3,1);pointer-events:none}
.toast.show{transform:translateY(0);opacity:1}
.toast.ok{color:var(--success);border-color:rgba(78,203,113,.3)}
</style>
</head>
<body>

<div class="topbar">
  <a class="brand" href="/">V<em>ault</em> <span style="color:var(--muted);font-weight:400;font-size:.85rem">/ paste</span></a>
  <div class="topbar-actions">
    <a href="${rawUrl}" target="_blank" class="btn btn-raw">⬡ Raw</a>
    <button class="btn btn-copy-inline" onclick="copyContent()">⎘ Copy</button>
    <button class="btn btn-ghost" onclick="downloadPaste()">↓ Download</button>
  </div>
</div>

${wasBurn ? '<div class="burn-banner">🔥 Burn-after-read — this paste has been permanently deleted from the server</div>' : ''}

<div class="meta-bar">
  <div class="meta-chip">LANG <span><span class="lang-badge">${lang}</span></span></div>
  <div class="meta-chip">LINES <span>${lineCount}</span></div>
  <div class="meta-chip">SIZE <span>${sizeLabel}</span></div>
  <div class="meta-chip">VIEWS <span>${paste.view_count + 1}</span></div>
  <div class="meta-chip">EXPIRY <span>${expiryText}</span></div>
  <div class="meta-chip">CREATED <span>${timeAgo(paste.created_at)}</span></div>
  ${paste.burn_after_read && !wasBurn ? '<div class="meta-chip" style="color:var(--danger)">🔥 <span style="color:var(--danger)">BURN AFTER READ</span></div>' : ''}
</div>

<div class="title-bar">
  <div class="paste-title">${paste.title || 'Untitled Paste'}</div>
</div>

<div class="code-outer">
  <div class="line-col" id="lineNums">${Array.from({length: lineCount}, (_, i) => i + 1).join('\n')}</div>
  <div class="code-col">
    <pre><code class="language-${lang}" id="codeBlock">${escaped}</code></pre>
  </div>
</div>

<div class="footer">
  <span>Created ${timeAgo(paste.created_at)}</span>
  <span>Raw: <a href="${rawUrl}" style="color:var(--accent);text-decoration:none">${rawUrl}</a></span>
  <span>Vault · Secure Sharing</span>
</div>

<div class="toast" id="toast"></div>

<script>
hljs.highlightAll();

// Keep line numbers font-size in sync with code block
const raw = ${JSON.stringify(paste.content)};
const lang = ${JSON.stringify(lang)};
const title = ${JSON.stringify(paste.title || 'paste')};

function showToast(msg, cls = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + cls;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2500);
}

function copyContent() {
  navigator.clipboard.writeText(raw).then(() => showToast('✓ Copied to clipboard', 'ok'));
}

function downloadPaste() {
  const ext = {
    javascript:'js',typescript:'ts',python:'py',java:'java',c:'c',cpp:'cpp',
    csharp:'cs',go:'go',rust:'rs',php:'php',ruby:'rb',swift:'swift',kotlin:'kt',
    bash:'sh',sql:'sql',html:'html',css:'css',json:'json',yaml:'yml',
    markdown:'md',xml:'xml',plaintext:'txt'
  }[lang] || 'txt';
  const blob = new Blob([raw], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (title.replace(/[^a-z0-9_\-. ]/gi,'_') || 'paste') + '.' + ext;
  a.click(); URL.revokeObjectURL(url);
  showToast('↓ Downloading…', 'ok');
}
</script>
</body>
</html>`;
}

module.exports = router;
