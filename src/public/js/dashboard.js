// ── State ──
let allFiles = [];
let deleteTargetId = null;

// ── Utilities ──
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeUntil(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fileIcon(mime, name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return '🖼️';
  if (['mp4','mov','avi','mkv','webm','m4v'].includes(ext)) return '🎬';
  if (['mp3','wav','flac','aac','ogg','m4a'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx','csv'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📽️';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return '🗜️';
  if (['js','ts','py','java','cpp','c','go','rs','php','rb','sh'].includes(ext)) return '💻';
  if (['html','css','json','xml','yaml','yml'].includes(ext)) return '🌐';
  if (['txt','md'].includes(ext)) return '📄';
  return '📁';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, 3000);
}

// ── API ──
async function fetchFiles() {
  const res = await fetch('/api/files');
  if (!res.ok) { window.location.href = '/login'; return []; }
  return res.json();
}

async function deleteFile(id) {
  const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
  return res.ok;
}

// ── Render ──
function renderFiles(files) {
  const grid = document.getElementById('fileGrid');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.style.display = 'none';

  if (!files.length) {
    empty.style.display = 'flex';
    grid.innerHTML = '';
    return;
  }

  empty.style.display = 'none';

  // Stats
  const totalSize = files.reduce((a, f) => a + (f.size || 0), 0);
  document.getElementById('statTotal').textContent = files.length;
  document.getElementById('statSize').textContent = formatSize(totalSize);

  grid.innerHTML = files.map((f, i) => {
    const expired = f.isExpired;
    const expiresIn = f.expires_at ? timeUntil(f.expires_at) : null;
    const soon = f.expires_at && (f.expires_at - Date.now()) < 3600000 && !expired;

    return `
    <div class="file-card ${expired ? 'expired' : ''}" style="animation-delay:${i * 0.04}s" data-id="${f.id}">
      <div class="card-top">
        <div class="file-type-icon">${fileIcon(f.mime_type, f.original_name)}</div>
        <div class="file-meta">
          <div class="file-name" title="${f.original_name}">${f.original_name}</div>
          <div class="file-info">${formatSize(f.size)} · ${formatDate(f.created_at)}</div>
        </div>
      </div>
      <div class="card-badges">
        <span class="badge badge-dl">↓ ${f.download_count}${f.max_downloads ? '/' + f.max_downloads : ''} downloads</span>
        ${expiresIn && !expired ? `<span class="badge badge-exp ${soon ? 'soon' : ''}">⏱ ${expiresIn}</span>` : ''}
        ${!f.expires_at ? `<span class="badge badge-max">∞ no expiry</span>` : ''}
      </div>
      ${f.notes ? `<div class="file-note">💬 ${f.notes}</div>` : ''}
      <div class="card-actions">
        <button class="action-btn" onclick="openShare('${f.shareUrl}')">🔗 Share</button>
        <button class="action-btn" onclick="downloadFile('${f.shareUrl}', '${f.original_name}')">⬇ Download</button>
        <button class="action-btn danger" onclick="promptDelete('${f.id}', '${f.original_name.replace(/'/g, "\\'")}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

// ── Load ──
async function loadFiles() {
  document.getElementById('loadingState').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('fileGrid').innerHTML = '';

  allFiles = await fetchFiles();
  renderFiles(allFiles);
}

// ── Search ──
document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderFiles(q ? allFiles.filter(f => f.original_name.toLowerCase().includes(q) || (f.notes || '').toLowerCase().includes(q)) : allFiles);
});

// ── Share ──
function openShare(url) {
  document.getElementById('shareUrl').value = url;
  document.getElementById('copyBtn').textContent = 'Copy';
  document.getElementById('copyBtn').className = 'btn-copy';
  document.getElementById('shareModal').classList.add('open');
}

function downloadFile(shareUrl, name) {
  const a = document.createElement('a');
  a.href = shareUrl;
  a.download = name;
  a.target = '_blank';
  a.click();
}

document.getElementById('copyBtn').addEventListener('click', () => {
  const url = document.getElementById('shareUrl').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✓ Copied';
    btn.className = 'btn-copy copied';
  });
});

['closeShare', 'closeShare2'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('shareModal').classList.remove('open');
  });
});

// ── Delete ──
function promptDelete(id, name) {
  deleteTargetId = id;
  document.getElementById('deleteFileName').textContent = name;
  document.getElementById('deleteModal').classList.add('open');
}

document.getElementById('closeDelete').addEventListener('click', () => {
  document.getElementById('deleteModal').classList.remove('open');
});
document.getElementById('cancelDelete').addEventListener('click', () => {
  document.getElementById('deleteModal').classList.remove('open');
});

document.getElementById('confirmDelete').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  const btn = document.getElementById('confirmDelete');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  const ok = await deleteFile(deleteTargetId);
  document.getElementById('deleteModal').classList.remove('open');
  btn.disabled = false;
  btn.textContent = 'Delete Forever';

  if (ok) {
    showToast('File deleted', 'success');
    loadFiles();
  } else {
    showToast('Failed to delete file', 'error');
  }
});

// ── Upload ──
let selectedFile = null;

function openUpload() {
  document.getElementById('uploadModal').classList.add('open');
  resetUpload();
}

function resetUpload() {
  selectedFile = null;
  document.getElementById('dropZone').style.display = '';
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('fileInput').value = '';
  document.getElementById('expiresIn').value = 'never';
  document.getElementById('maxDownloads').value = '';
  document.getElementById('fileNote').value = '';
}

function selectFile(file) {
  selectedFile = file;
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('selectedFile').style.display = 'flex';
  document.getElementById('sfName').textContent = file.name;
  document.getElementById('sfSize').textContent = formatSize(file.size);
  document.getElementById('sfIcon').textContent = fileIcon(file.type, file.name);
  document.getElementById('confirmUpload').disabled = false;
}

// Drop zone
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  if (e.target.files[0]) selectFile(e.target.files[0]);
});

document.getElementById('sfRemove').addEventListener('click', () => {
  selectedFile = null;
  document.getElementById('dropZone').style.display = '';
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('fileInput').value = '';
});

// Open/close upload modal
['uploadBtn', 'uploadTrigger', 'emptyUploadBtn'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', openUpload);
});

document.getElementById('closeUpload').addEventListener('click', () => {
  document.getElementById('uploadModal').classList.remove('open');
});
document.getElementById('cancelUpload').addEventListener('click', () => {
  document.getElementById('uploadModal').classList.remove('open');
});

// Confirm upload
document.getElementById('confirmUpload').addEventListener('click', () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('expires_in', document.getElementById('expiresIn').value);
  const maxDl = document.getElementById('maxDownloads').value;
  if (maxDl) formData.append('max_downloads', maxDl);
  const note = document.getElementById('fileNote').value;
  if (note) formData.append('notes', note);

  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('cancelUpload').disabled = true;
  document.getElementById('closeUpload').disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files/upload');

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressText').textContent = `Uploading… ${pct}%`;
    }
  });

  xhr.addEventListener('load', () => {
    try {
      const data = JSON.parse(xhr.responseText);
      if (data.success) {
        document.getElementById('progressText').textContent = 'Upload complete!';
        document.getElementById('progressBar').style.width = '100%';
        setTimeout(() => {
          document.getElementById('uploadModal').classList.remove('open');
          loadFiles();
          setTimeout(() => openShare(data.file.shareUrl), 400);
          showToast('File uploaded successfully', 'success');
        }, 600);
      } else {
        showToast(data.error || 'Upload failed', 'error');
        document.getElementById('cancelUpload').disabled = false;
        document.getElementById('closeUpload').disabled = false;
        document.getElementById('confirmUpload').disabled = false;
        document.getElementById('uploadProgress').style.display = 'none';
      }
    } catch {
      showToast('Upload failed', 'error');
    }
  });

  xhr.addEventListener('error', () => {
    showToast('Upload failed — network error', 'error');
    document.getElementById('cancelUpload').disabled = false;
    document.getElementById('closeUpload').disabled = false;
    document.getElementById('confirmUpload').disabled = false;
    document.getElementById('uploadProgress').style.display = 'none';
  });

  xhr.send(formData);
});

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Logout ──
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ── Init ──
loadFiles();

// Refresh every 30 seconds
setInterval(loadFiles, 30000);
