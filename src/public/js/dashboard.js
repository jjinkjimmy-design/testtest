// ── State ──
const state = {
  view: 'files',         // 'files' | 'pastes' | 'stats'
  activeFolderId: null,  // null = all, 'none' = unfiled
  files: [],
  folders: [],
  pastes: [],
  bulkMode: false,
  selected: new Set(),
  charts: {},
  renameTargetId: null,
  versionTargetId: null,
  deleteTarget: null,    // { id, name, type: 'file'|'paste' }
};

// ── Utilities ──
function fmt(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}

function timeUntil(ts) {
  const d = ts - Date.now();
  if (d <= 0) return 'Expired';
  const h = Math.floor(d/3600000), m = Math.floor((d%3600000)/60000);
  if (h > 48) return Math.floor(h/24) + 'd';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function fileIcon(mime, name) {
  const e = (name||'').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(e)) return '🖼️';
  if (['mp4','mov','avi','mkv','webm','m4v','ogv'].includes(e)) return '🎬';
  if (['mp3','wav','flac','aac','ogg','m4a','opus'].includes(e)) return '🎵';
  if (e === 'pdf') return '📕';
  if (['doc','docx'].includes(e)) return '📝';
  if (['xls','xlsx','csv'].includes(e)) return '📊';
  if (['ppt','pptx'].includes(e)) return '📽️';
  if (['zip','rar','7z','tar','gz','bz2'].includes(e)) return '🗜️';
  if (['js','ts','py','java','cpp','c','go','rs','php','rb','sh','bash'].includes(e)) return '💻';
  if (['html','css','json','xml','yaml','yml','toml'].includes(e)) return '🌐';
  if (['txt','md','log'].includes(e)) return '📄';
  return '📁';
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── API ──
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
  return res.json();
}

// ── Navigation ──
function setView(view, folderId) {
  state.view = view;
  if (folderId !== undefined) state.activeFolderId = folderId;

  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (view === 'files') {
    document.querySelectorAll('.nav-item[data-view="files"]').forEach(el => {
      if ((el.dataset.folder || null) === (state.activeFolderId || null)) el.classList.add('active');
    });
  } else {
    const el = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (el) el.classList.add('active');
  }

  document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
  if (state.activeFolderId) {
    const fi = document.querySelector(`.folder-item[data-id="${state.activeFolderId}"]`);
    if (fi) fi.classList.add('active');
  }

  // Show/hide views
  ['filesView','pastesView','statsView'].forEach(id => {
    document.getElementById(id).style.display = id === view + 'View' ? '' : 'none';
  });

  // Show/hide search & action button
  const searchWrap = document.getElementById('searchWrap');
  const btn = document.getElementById('primaryActionBtn');
  if (view === 'files') {
    searchWrap.style.display = '';
    btn.textContent = '+ Upload';
    btn.onclick = openUploadModal;
    const folderObj = state.folders.find(f => f.id === state.activeFolderId);
    document.getElementById('pageTitle').textContent = folderObj ? folderObj.name : 'All Files';
    document.getElementById('breadcrumb').textContent = folderObj ? `vault / ${folderObj.name}` : 'vault / files';
    loadFiles();
  } else if (view === 'pastes') {
    searchWrap.style.display = '';
    btn.textContent = '+ New Paste';
    btn.onclick = openPasteModal;
    document.getElementById('pageTitle').textContent = 'Pastes';
    document.getElementById('breadcrumb').textContent = 'vault / pastes';
    document.getElementById('pasteSearchInput').value = '';
    document.getElementById('pasteSearchCount').style.display = 'none';
    loadPastes();
  } else if (view === 'stats') {
    searchWrap.style.display = 'none';
    btn.textContent = '↻ Refresh';
    btn.onclick = loadStats;
    document.getElementById('pageTitle').textContent = 'Analytics';
    document.getElementById('breadcrumb').textContent = 'vault / analytics';
    loadStats();
  }

  // Exit bulk mode on view change
  exitBulkMode();
}

// ── Folders ──
async function loadFolders() {
  state.folders = await api('/api/folders');
  renderFolderList();
  // Update folder selects in upload modal
  const sel = document.getElementById('uploadFolder');
  sel.innerHTML = '<option value="">None (unfiled)</option>';
  state.folders.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.name;
    sel.appendChild(o);
  });
}

function renderFolderList() {
  const list = document.getElementById('folderList');
  list.innerHTML = state.folders.map(f => `
    <div class="folder-item ${state.activeFolderId === f.id ? 'active' : ''}" data-id="${f.id}">
      <span>📂</span>
      <span class="folder-item-name">${f.name}</span>
      <span class="folder-count">${f.file_count}</span>
      <button class="folder-del" onclick="deleteFolder(event,'${f.id}','${f.name.replace(/'/g,"\\'")}')">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('folder-del')) return;
      setView('files', el.dataset.id);
    });
  });
}

async function deleteFolder(e, id, name) {
  e.stopPropagation();
  if (!confirm(`Delete folder "${name}"? Files inside will become unfiled.`)) return;
  await api(`/api/folders/${id}`, { method: 'DELETE' });
  if (state.activeFolderId === id) setView('files', null);
  await loadFolders();
  toast('Folder deleted');
}

document.getElementById('addFolderBtn').addEventListener('click', () => {
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderModal').classList.add('open');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 50);
});

document.getElementById('closeFolderModal').addEventListener('click', () => document.getElementById('folderModal').classList.remove('open'));
document.getElementById('cancelFolder').addEventListener('click', () => document.getElementById('folderModal').classList.remove('open'));

document.getElementById('confirmFolder').addEventListener('click', async () => {
  const name = document.getElementById('folderNameInput').value.trim();
  if (!name) return;
  const data = await api('/api/folders', { method: 'POST', body: JSON.stringify({ name }) });
  if (data.success) {
    document.getElementById('folderModal').classList.remove('open');
    await loadFolders();
    toast('Folder created', 'success');
  }
});

document.getElementById('folderNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('confirmFolder').click();
});

// ── Files ──
async function loadFiles() {
  document.getElementById('loadingState').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('fileGrid').innerHTML = '';
  const url = state.activeFolderId ? `/api/files?folder=${state.activeFolderId}` : '/api/files';
  state.files = await api(url);
  renderFiles(state.files);
  updateSidebarStats();
}

function renderFiles(files) {
  const grid = document.getElementById('fileGrid');
  document.getElementById('loadingState').style.display = 'none';
  if (!files.length) {
    document.getElementById('emptyState').style.display = 'flex';
    grid.innerHTML = '';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';
  grid.innerHTML = files.map((f, i) => {
    const expired = f.isExpired;
    const expiresIn = f.expires_at && !expired ? timeUntil(f.expires_at) : null;
    const soon = f.expires_at && !expired && (f.expires_at - Date.now()) < 3600000;
    const isSelected = state.selected.has(f.id);
    return `
    <div class="file-card ${expired ? 'expired' : ''} ${isSelected ? 'selected' : ''}" data-id="${f.id}" style="animation-delay:${i*.035}s">
      <label class="card-select"><input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${f.id}', this.checked)"></label>
      <div class="card-top">
        <div class="file-type-icon">${fileIcon(f.mime_type, f.original_name)}</div>
        <div class="file-meta">
          <div class="file-name" title="${f.original_name}">${f.original_name}${f.version > 1 ? `<span class="version-badge">v${f.version}</span>` : ''}</div>
          <div class="file-info">${fmt(f.size)} · ${fmtDate(f.created_at)}</div>
        </div>
      </div>
      <div class="card-badges">
        <span class="badge badge-dl">↓ ${f.download_count}${f.max_downloads ? '/'+f.max_downloads : ''}</span>
        ${expiresIn ? `<span class="badge badge-exp ${soon?'soon':''}">⏱ ${expiresIn}</span>` : ''}
        ${!f.expires_at ? '<span class="badge badge-forever">∞ forever</span>' : ''}
      </div>
      ${f.notes ? `<div class="file-note">💬 ${f.notes}</div>` : ''}
      <div class="card-actions">
        <button class="action-btn" onclick="openShare('${f.shareUrl}')">🔗 Share</button>
        <button class="action-btn" onclick="renameFile('${f.id}','${f.original_name.replace(/'/g,"\\'")}')">✏️ Rename</button>
        <button class="action-btn" onclick="uploadVersion('${f.id}')">🔄 Version</button>
        <button class="action-btn danger" onclick="promptDelete('${f.id}','${f.original_name.replace(/'/g,"\\'")}','file')">🗑</button>
      </div>
    </div>`;
  }).join('');

  if (state.bulkMode) document.getElementById('fileGrid').classList.add('bulk-mode');
}

function updateSidebarStats() {
  const total = state.files.length;
  const size = state.files.reduce((a, f) => a + (f.size || 0), 0);
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statSize').textContent = fmt(size);
  document.getElementById('statPastes').textContent = state.pastes.length || '—';
}

// ── Search ──
document.getElementById('searchInput').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  if (state.view === 'files') {
    renderFiles(q ? state.files.filter(f => f.original_name.toLowerCase().includes(q) || (f.notes||'').toLowerCase().includes(q)) : state.files);
  } else if (state.view === 'pastes') {
    // Sync with in-view search bar too
    document.getElementById('pasteSearchInput').value = e.target.value;
    const filtered = q ? state.pastes.filter(p => (p.title||'').toLowerCase().includes(q) || p.content.toLowerCase().includes(q)) : state.pastes;
    renderPastes(filtered, q);
  }
});

// Dedicated paste search bar — searches title + full content with highlights
document.getElementById('pasteSearchInput').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.getElementById('searchInput').value = e.target.value; // keep in sync
  const filtered = q
    ? state.pastes.filter(p => (p.title||'').toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    : state.pastes;
  renderPastes(filtered, q);
});

// ── Bulk Select ──
function toggleSelect(id, checked) {
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  updateBulkBar();
  if (!state.bulkMode && state.selected.size > 0) enterBulkMode();
  if (state.bulkMode && state.selected.size === 0) exitBulkMode();
}

function enterBulkMode() {
  state.bulkMode = true;
  document.getElementById('bulkBar').style.display = 'flex';
  document.getElementById('fileGrid').classList.add('bulk-mode');
  updateBulkBar();
}

function exitBulkMode() {
  state.bulkMode = false;
  state.selected.clear();
  document.getElementById('bulkBar').style.display = 'none';
  document.getElementById('fileGrid')?.classList.remove('bulk-mode');
  document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);
  document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
}

function updateBulkBar() {
  document.getElementById('bulkCount').textContent = `${state.selected.size} selected`;
}

document.getElementById('bulkCancel').addEventListener('click', exitBulkMode);

document.getElementById('bulkSelectAll').addEventListener('click', () => {
  state.files.forEach(f => state.selected.add(f.id));
  document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = true);
  document.querySelectorAll('.file-card').forEach(c => c.classList.add('selected'));
  updateBulkBar();
  if (!state.bulkMode) enterBulkMode();
});

document.getElementById('bulkDeleteBtn').addEventListener('click', async () => {
  if (!state.selected.size) return;
  if (!confirm(`Delete ${state.selected.size} file(s)? This cannot be undone.`)) return;
  const ids = [...state.selected];
  const res = await api('/api/files/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  if (res.success) {
    toast(`${res.deleted} file(s) deleted`, 'success');
    exitBulkMode();
    loadFiles();
  }
});

// ── Share Modal ──
async function openShare(url) {
  document.getElementById('shareUrl').value = url;
  document.getElementById('copyBtn').textContent = 'Copy';
  document.getElementById('copyBtn').className = 'btn-copy';
  document.getElementById('qrWrap').innerHTML = '<div class="qr-loading">Generating QR…</div>';
  document.getElementById('shareModal').classList.add('open');
  try {
    const data = await api(`/api/qr?url=${encodeURIComponent(url)}`);
    document.getElementById('qrWrap').innerHTML = `<img src="${data.qr}" width="180" height="180" alt="QR Code">`;
  } catch { document.getElementById('qrWrap').innerHTML = '<div class="qr-loading">QR unavailable</div>'; }
}

document.getElementById('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('shareUrl').value).then(() => {
    document.getElementById('copyBtn').textContent = '✓ Copied';
    document.getElementById('copyBtn').className = 'btn-copy copied';
  });
});
['closeShare','closeShare2'].forEach(id => document.getElementById(id).addEventListener('click', () => document.getElementById('shareModal').classList.remove('open')));

// ── Rename ──
function renameFile(id, currentName) {
  state.renameTargetId = id;
  document.getElementById('renameInput').value = currentName;
  document.getElementById('renameModal').classList.add('open');
  setTimeout(() => { const i = document.getElementById('renameInput'); i.focus(); i.select(); }, 50);
}

document.getElementById('closeRename').addEventListener('click', () => document.getElementById('renameModal').classList.remove('open'));
document.getElementById('cancelRename').addEventListener('click', () => document.getElementById('renameModal').classList.remove('open'));
document.getElementById('renameInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('confirmRename').click(); });

document.getElementById('confirmRename').addEventListener('click', async () => {
  const name = document.getElementById('renameInput').value.trim();
  if (!name || !state.renameTargetId) return;
  const res = await api(`/api/files/${state.renameTargetId}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) });
  if (res.success) {
    document.getElementById('renameModal').classList.remove('open');
    toast('File renamed', 'success');
    loadFiles();
  }
});

// ── Version Upload ──
let versionSelectedFile = null;

function uploadVersion(id) {
  state.versionTargetId = id;
  versionSelectedFile = null;
  document.getElementById('versionDropZone').style.display = '';
  document.getElementById('versionSelectedFile').style.display = 'none';
  document.getElementById('versionProgress').style.display = 'none';
  document.getElementById('confirmVersion').disabled = true;
  document.getElementById('versionFileInput').value = '';
  document.getElementById('versionModal').classList.add('open');
}

document.getElementById('closeVersion').addEventListener('click', () => document.getElementById('versionModal').classList.remove('open'));
document.getElementById('cancelVersion').addEventListener('click', () => document.getElementById('versionModal').classList.remove('open'));

const vdz = document.getElementById('versionDropZone');
vdz.addEventListener('click', () => document.getElementById('versionFileInput').click());
vdz.addEventListener('dragover', e => { e.preventDefault(); vdz.classList.add('dragging'); });
vdz.addEventListener('dragleave', () => vdz.classList.remove('dragging'));
vdz.addEventListener('drop', e => { e.preventDefault(); vdz.classList.remove('dragging'); if (e.dataTransfer.files[0]) selectVersionFile(e.dataTransfer.files[0]); });
document.getElementById('versionFileInput').addEventListener('change', e => { if (e.target.files[0]) selectVersionFile(e.target.files[0]); });

function selectVersionFile(file) {
  versionSelectedFile = file;
  document.getElementById('versionDropZone').style.display = 'none';
  document.getElementById('versionSelectedFile').style.display = 'flex';
  document.getElementById('vsfIcon').textContent = fileIcon(file.type, file.name);
  document.getElementById('vsfName').textContent = file.name;
  document.getElementById('vsfSize').textContent = fmt(file.size);
  document.getElementById('confirmVersion').disabled = false;
}

document.getElementById('vsfRemove').addEventListener('click', () => {
  versionSelectedFile = null;
  document.getElementById('versionDropZone').style.display = '';
  document.getElementById('versionSelectedFile').style.display = 'none';
  document.getElementById('confirmVersion').disabled = true;
});

document.getElementById('confirmVersion').addEventListener('click', () => {
  if (!versionSelectedFile || !state.versionTargetId) return;
  const fd = new FormData();
  fd.append('file', versionSelectedFile);
  document.getElementById('versionProgress').style.display = 'block';
  document.getElementById('confirmVersion').disabled = true;
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/files/${state.versionTargetId}/version`);
  xhr.upload.addEventListener('progress', e => {
    if (e.lengthComputable) {
      const pct = Math.round(e.loaded/e.total*100);
      document.getElementById('versionProgressBar').style.width = pct + '%';
      document.getElementById('versionProgressText').textContent = `Uploading… ${pct}%`;
    }
  });
  xhr.addEventListener('load', () => {
    const data = JSON.parse(xhr.responseText);
    if (data.success) {
      document.getElementById('versionModal').classList.remove('open');
      toast('New version uploaded', 'success');
      loadFiles();
    } else {
      toast(data.error || 'Upload failed', 'error');
      document.getElementById('confirmVersion').disabled = false;
    }
  });
  xhr.send(fd);
});

// ── Upload Modal ──
let selectedFile = null;
let uploadDuplicateConfirmed = false;

function openUploadModal() {
  selectedFile = null;
  uploadDuplicateConfirmed = false;
  document.getElementById('dropZone').style.display = '';
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('uploadOptions').style.display = '';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('fileInput').value = '';
  document.getElementById('expiresIn').value = 'never';
  document.getElementById('maxDownloads').value = '';
  document.getElementById('fileNote').value = '';
  document.getElementById('allowDuplicate').checked = false;
  // Pre-select current folder
  if (state.activeFolderId) document.getElementById('uploadFolder').value = state.activeFolderId;
  else document.getElementById('uploadFolder').value = '';
  document.getElementById('uploadModal').classList.add('open');
}

const dz = document.getElementById('dropZone');
dz.addEventListener('click', () => document.getElementById('fileInput').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragging'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragging'); if (e.dataTransfer.files[0]) selectUploadFile(e.dataTransfer.files[0]); });
document.getElementById('fileInput').addEventListener('change', e => { if (e.target.files[0]) selectUploadFile(e.target.files[0]); });

function selectUploadFile(file) {
  selectedFile = file;
  uploadDuplicateConfirmed = false;
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('selectedFile').style.display = 'flex';
  document.getElementById('sfIcon').textContent = fileIcon(file.type, file.name);
  document.getElementById('sfName').textContent = file.name;
  document.getElementById('sfSize').textContent = fmt(file.size);
  document.getElementById('confirmUpload').disabled = false;
}

document.getElementById('sfRemove').addEventListener('click', () => {
  selectedFile = null;
  document.getElementById('dropZone').style.display = '';
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('fileInput').value = '';
});

document.getElementById('allowDuplicate').addEventListener('change', e => {
  uploadDuplicateConfirmed = e.target.checked;
});

['closeUpload','cancelUpload'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => document.getElementById('uploadModal').classList.remove('open'));
});

['uploadTrigger','emptyUploadBtn'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', openUploadModal);
});

document.getElementById('emptyPasteBtn')?.addEventListener('click', openPasteModal);

document.getElementById('confirmUpload').addEventListener('click', () => {
  if (!selectedFile) return;
  const fd = new FormData();
  fd.append('file', selectedFile);
  fd.append('expires_in', document.getElementById('expiresIn').value);
  const md = document.getElementById('maxDownloads').value;
  if (md) fd.append('max_downloads', md);
  const note = document.getElementById('fileNote').value;
  if (note) fd.append('notes', note);
  const folder = document.getElementById('uploadFolder').value;
  if (folder) fd.append('folder_id', folder);
  if (uploadDuplicateConfirmed) fd.append('allow_duplicate', 'true');

  document.getElementById('uploadOptions').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('confirmUpload').disabled = true;
  document.getElementById('cancelUpload').disabled = true;
  document.getElementById('closeUpload').disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files/upload');
  xhr.upload.addEventListener('progress', e => {
    if (e.lengthComputable) {
      const pct = Math.round(e.loaded/e.total*100);
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressText').textContent = `Uploading… ${pct}%`;
    }
  });
  xhr.addEventListener('load', () => {
    const data = JSON.parse(xhr.responseText);
    // Reset buttons
    document.getElementById('cancelUpload').disabled = false;
    document.getElementById('closeUpload').disabled = false;

    if (data.duplicate) {
      // Show duplicate warning
      document.getElementById('uploadOptions').style.display = '';
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('confirmUpload').disabled = false;
      document.getElementById('dupWarning').style.display = 'flex';
      document.getElementById('dupFileName').textContent = data.existing.original_name;
      uploadDuplicateConfirmed = false;
      document.getElementById('allowDuplicate').checked = false;
      return;
    }

    if (data.success) {
      document.getElementById('progressText').textContent = 'Upload complete!';
      document.getElementById('progressBar').style.width = '100%';
      setTimeout(() => {
        document.getElementById('uploadModal').classList.remove('open');
        loadFiles(); loadFolders();
        setTimeout(() => openShare(data.file.shareUrl), 300);
        toast('File uploaded', 'success');
      }, 500);
    } else {
      toast(data.error || 'Upload failed', 'error');
      document.getElementById('uploadOptions').style.display = '';
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('confirmUpload').disabled = false;
    }
  });
  xhr.send(fd);
});

// ── Delete ──
function promptDelete(id, name, type = 'file') {
  state.deleteTarget = { id, name, type };
  document.getElementById('deleteFileName').textContent = name;
  document.getElementById('deleteModal').classList.add('open');
}

document.getElementById('closeDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('open'));
document.getElementById('cancelDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('open'));

document.getElementById('confirmDelete').addEventListener('click', async () => {
  if (!state.deleteTarget) return;
  const { id, type } = state.deleteTarget;
  document.getElementById('confirmDelete').disabled = true;
  document.getElementById('confirmDelete').textContent = 'Deleting…';
  const endpoint = type === 'paste' ? `/api/pastes/${id}` : `/api/files/${id}`;
  const res = await api(endpoint, { method: 'DELETE' });
  document.getElementById('deleteModal').classList.remove('open');
  document.getElementById('confirmDelete').disabled = false;
  document.getElementById('confirmDelete').textContent = 'Delete Forever';
  if (res.success) {
    toast('Deleted', 'success');
    type === 'paste' ? loadPastes() : loadFiles();
  }
});

// ── Pastes ──
async function loadPastes() {
  document.getElementById('pastesLoading').style.display = 'flex';
  document.getElementById('pastesEmpty').style.display = 'none';
  document.getElementById('pasteGrid').innerHTML = '';
  state.pastes = await api('/api/pastes');
  renderPastes(state.pastes);
  document.getElementById('statPastes').textContent = state.pastes.length;
}

function highlight(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="paste-match">$1</mark>');
}

function renderPastes(pastes, query = '') {
  document.getElementById('pastesLoading').style.display = 'none';

  const countEl = document.getElementById('pasteSearchCount');
  if (query) {
    countEl.style.display = 'block';
    countEl.textContent = `${pastes.length} result${pastes.length !== 1 ? 's' : ''} for "${query}"`;
  } else {
    countEl.style.display = 'none';
  }

  if (!pastes.length) {
    document.getElementById('pastesEmpty').style.display = 'flex';
    document.getElementById('pasteGrid').innerHTML = '';
    return;
  }
  document.getElementById('pastesEmpty').style.display = 'none';
  document.getElementById('pasteGrid').innerHTML = pastes.map((p, i) => {
    const preview = p.content.slice(0, 160).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const titleHtml = highlight((p.title || 'Untitled Paste').replace(/&/g,'&amp;').replace(/</g,'&lt;'), query);
    const previewHtml = highlight(preview, query);
    const lines = p.content.split('\n').length;
    const expired = p.expires_at && p.expires_at < Date.now();
    return `
    <div class="paste-card" style="animation-delay:${i*.035}s">
      <div class="paste-top">
        <div class="paste-title">${titleHtml}</div>
        <span class="paste-lang">${p.language || 'text'}</span>
      </div>
      <div class="paste-preview">${previewHtml}${p.content.length > 160 ? '…' : ''}</div>
      <div class="paste-meta">
        <span class="paste-meta-item">👁 ${p.view_count} views</span>
        <span class="paste-meta-item">📝 ${lines} lines</span>
        ${p.burn_after_read ? '<span class="paste-meta-item" style="color:#ff6b6b">🔥 Burn</span>' : ''}
        ${expired ? '<span class="paste-meta-item" style="color:#ff6b6b">Expired</span>' : ''}
      </div>
      <div class="paste-actions">
        <button class="action-btn" onclick="openPasteShare('${p.shareUrl}')">🔗 Share</button>
        <button class="action-btn" onclick="window.open('${p.shareUrl}','_blank')">👁 View</button>
        <button class="action-btn" onclick="window.open('${p.shareUrl}/raw','_blank')">⬡ Raw</button>
        <button class="action-btn" onclick="editPaste('${p.id}')">✏️ Edit</button>
        <button class="action-btn danger" onclick="promptDelete('${p.id}','${(p.title||'Untitled Paste').replace(/'/g,"\\'")}','paste')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function openPasteModal() {
  document.getElementById('pasteTitle').value = '';
  document.getElementById('pasteContent').value = '';
  document.getElementById('pasteLang').value = 'plaintext';
  document.getElementById('pasteExpiry').value = 'never';
  document.getElementById('pasteBurn').checked = false;
  document.getElementById('pasteModal').classList.add('open');
  setTimeout(() => document.getElementById('pasteContent').focus(), 50);
}

['closePaste','cancelPaste'].forEach(id => document.getElementById(id).addEventListener('click', () => document.getElementById('pasteModal').classList.remove('open')));

document.getElementById('confirmPaste').addEventListener('click', async () => {
  const content = document.getElementById('pasteContent').value;
  if (!content.trim()) { toast('Content required', 'error'); return; }
  const btn = document.getElementById('confirmPaste');
  btn.disabled = true; btn.textContent = 'Creating…';
  const res = await api('/api/pastes', { method: 'POST', body: JSON.stringify({
    title: document.getElementById('pasteTitle').value,
    content,
    language: document.getElementById('pasteLang').value,
    expires_in: document.getElementById('pasteExpiry').value,
    burn_after_read: document.getElementById('pasteBurn').checked
  })});
  btn.disabled = false; btn.textContent = 'Create Paste';
  if (res.success) {
    document.getElementById('pasteModal').classList.remove('open');
    loadPastes();
    setTimeout(() => openPasteShare(res.paste.shareUrl), 300);
    toast('Paste created', 'success');
  }
});

// ── Edit Paste ──
function editPaste(id) {
  const paste = state.pastes.find(p => p.id === id);
  if (!paste) return;
  state.editPasteId = id;

  document.getElementById('editPasteTitle').value   = paste.title    || '';
  document.getElementById('editPasteContent').value = paste.content  || '';
  document.getElementById('editPasteLang').value    = paste.language || 'plaintext';

  // Pick closest expiry option based on remaining time
  const expirySelect = document.getElementById('editPasteExpiry');
  if (!paste.expires_at) {
    expirySelect.value = 'never';
  } else {
    const r = paste.expires_at - Date.now();
    if      (r < 4 * 3600000)   expirySelect.value = '1h';
    else if (r < 18 * 3600000)  expirySelect.value = '6h';
    else if (r < 2 * 86400000)  expirySelect.value = '24h';
    else if (r < 14 * 86400000) expirySelect.value = '7d';
    else                        expirySelect.value = '30d';
  }

  document.getElementById('pasteEditModal').classList.add('open');
  setTimeout(() => document.getElementById('editPasteContent').focus(), 60);
}

document.getElementById('closePasteEdit').addEventListener('click',  () => document.getElementById('pasteEditModal').classList.remove('open'));
document.getElementById('cancelPasteEdit').addEventListener('click', () => document.getElementById('pasteEditModal').classList.remove('open'));

document.getElementById('confirmPasteEdit').addEventListener('click', async () => {
  if (!state.editPasteId) return;
  const btn = document.getElementById('confirmPasteEdit');
  btn.disabled = true; btn.textContent = 'Saving…';

  const res = await api(`/api/pastes/${state.editPasteId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title:      document.getElementById('editPasteTitle').value,
      content:    document.getElementById('editPasteContent').value,
      language:   document.getElementById('editPasteLang').value,
      expires_in: document.getElementById('editPasteExpiry').value
    })
  });

  btn.disabled = false; btn.textContent = 'Save Changes';
  if (res.success) {
    document.getElementById('pasteEditModal').classList.remove('open');
    // Clear search so freshly edited paste is visible
    document.getElementById('pasteSearchInput').value = '';
    document.getElementById('searchInput').value = '';
    toast('Paste updated ✓', 'success');
    loadPastes();
  } else {
    toast(res.error || 'Failed to save', 'error');
  }
});

async function openPasteShare(url) {
  const rawUrl = url + '/raw';
  document.getElementById('pasteShareUrl').value = url;
  document.getElementById('pasteCopyBtn').textContent = 'Copy';
  document.getElementById('pasteCopyBtn').className = 'btn-copy';
  // Raw URL row
  document.getElementById('pasteRawUrl').value = rawUrl;
  document.getElementById('pasteQrWrap').innerHTML = '<div class="qr-loading">Generating QR…</div>';
  document.getElementById('pasteShareModal').classList.add('open');
  try {
    const data = await api(`/api/qr?url=${encodeURIComponent(url)}`);
    document.getElementById('pasteQrWrap').innerHTML = `<img src="${data.qr}" width="180" height="180" alt="QR Code">`;
  } catch { document.getElementById('pasteQrWrap').innerHTML = ''; }
}

document.getElementById('pasteCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('pasteShareUrl').value).then(() => {
    document.getElementById('pasteCopyBtn').textContent = '✓ Copied';
    document.getElementById('pasteCopyBtn').className = 'btn-copy copied';
  });
});

document.getElementById('pasteRawCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('pasteRawUrl').value).then(() => {
    const btn = document.getElementById('pasteRawCopyBtn');
    btn.textContent = '✓ Copied';
    btn.className = 'btn-copy copied';
    setTimeout(() => { btn.textContent = 'Copy Raw'; btn.className = 'btn-copy'; }, 2000);
  });
});
['closePasteShare','closePasteShare2'].forEach(id => document.getElementById(id).addEventListener('click', () => document.getElementById('pasteShareModal').classList.remove('open')));

// ── Stats / Charts ──
async function loadStats() {
  const stats = await api('/api/stats');
  renderStatCards(stats);
  renderCharts(stats);
}

function renderStatCards(s) {
  document.getElementById('statsCards').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Files</div><div class="stat-card-val accent">${s.totalFiles}</div></div>
    <div class="stat-card"><div class="stat-card-label">Storage Used</div><div class="stat-card-val">${fmt(s.totalSize)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Downloads</div><div class="stat-card-val success">${s.totalDownloads}</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Pastes</div><div class="stat-card-val warn">${s.totalPastes}</div></div>
  `;
}

function renderCharts(s) {
  const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#13131f', titleColor: '#e0e0f0', bodyColor: '#8080b0', borderColor: '#2e2e50', borderWidth: 1 } }
  };

  // Destroy old charts
  if (state.charts.activity) state.charts.activity.destroy();
  if (state.charts.downloads) state.charts.downloads.destroy();

  // Fill in missing days for last 30 days
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const uploadMap = Object.fromEntries((s.uploadsPerDay || []).map(r => [r.day, r.count]));
  const downloadMap = Object.fromEntries((s.downloadsPerDay || []).map(r => [r.day, r.count]));
  const uploadData = days.map(d => uploadMap[d] || 0);
  const downloadData = days.map(d => downloadMap[d] || 0);
  const labels = days.map(d => { const dt = new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' }); });

  state.charts.activity = new Chart(document.getElementById('activityChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Uploads', data: uploadData, borderColor: '#7c6af7', backgroundColor: 'rgba(124,106,247,0.08)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#7c6af7' },
        { label: 'Downloads', data: downloadData, borderColor: '#4ecb71', backgroundColor: 'rgba(78,203,113,0.06)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#4ecb71' }
      ]
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: true, labels: { color: '#8080b0', font: { family: 'DM Mono', size: 11 }, boxWidth: 12 } } }, scales: { x: { ticks: { color: '#5a5a8a', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8 }, grid: { color: '#1e1e32' } }, y: { ticks: { color: '#5a5a8a', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#1e1e32' }, beginAtZero: true } } }
  });

  const topFiles = s.topFiles || [];
  state.charts.downloads = new Chart(document.getElementById('downloadsChart'), {
    type: 'bar',
    data: {
      labels: topFiles.map(f => f.original_name.length > 20 ? f.original_name.slice(0,18)+'…' : f.original_name),
      datasets: [{ data: topFiles.map(f => f.download_count), backgroundColor: 'rgba(124,106,247,0.5)', borderColor: '#7c6af7', borderWidth: 1, borderRadius: 5 }]
    },
    options: { ...chartDefaults, indexAxis: 'y', scales: { x: { ticks: { color: '#5a5a8a', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#1e1e32' }, beginAtZero: true }, y: { ticks: { color: '#8080b0', font: { family: 'DM Mono', size: 10 } }, grid: { display: false } } } }
  });
}

// ── Nav wiring ──
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => {
    const view = el.dataset.view;
    const folder = el.dataset.folder !== undefined ? (el.dataset.folder || null) : state.activeFolderId;
    setView(view, folder === '' ? null : folder);
  });
});

// ── Bottom nav wiring (mobile) ──
document.querySelectorAll('.bottom-nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => {
    setView(el.dataset.view, el.dataset.folder === '' ? null : (el.dataset.folder || state.activeFolderId));
  });
});

// Keep bottom nav active state in sync with setView
const _origSetView = setView;
// Patch setView to also update bottom nav active item
function syncBottomNav(view) {
  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
}

// FAB centre button = primary action (upload on files, new paste on pastes)
document.getElementById('bnavUpload').addEventListener('click', () => {
  if (state.view === 'pastes') openPasteModal();
  else openUploadModal();
});

// Bottom nav search button → open mobile search overlay
document.getElementById('bnavSearch').addEventListener('click', () => {
  document.getElementById('mobileSearchOverlay').classList.add('open');
  setTimeout(() => document.getElementById('mobileSearchInput').focus(), 80);
});

// Mobile search overlay — cancel
document.getElementById('mobileSearchCancel').addEventListener('click', () => {
  document.getElementById('mobileSearchOverlay').classList.remove('open');
  document.getElementById('mobileSearchInput').value = '';
  // Clear any active search
  document.getElementById('searchInput').value = '';
  if (state.view === 'files') renderFiles(state.files);
  if (state.view === 'pastes') renderPastes(state.pastes);
});

// Mobile search overlay — input mirrors the topbar search
document.getElementById('mobileSearchInput').addEventListener('input', e => {
  const q = e.target.value;
  document.getElementById('searchInput').value = q;
  // Trigger the topbar search handler
  document.getElementById('searchInput').dispatchEvent(new Event('input'));
});

// Mobile action button in header mirrors primaryActionBtn
document.getElementById('mobileActionBtn').addEventListener('click', () => {
  document.getElementById('primaryActionBtn').click();
});

// ── Modal backdrop close ──
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ── Logout ──
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ── Primary action button default ──
document.getElementById('primaryActionBtn').onclick = openUploadModal;

// ── Sync bottom nav on every view change ──
// Patch setView to call syncBottomNav after each navigation
const _setViewOrig = setView;
setView = function(view, folderId) {
  _setViewOrig(view, folderId);
  syncBottomNav(view);
  // Update mobile header action button label
  const mab = document.getElementById('mobileActionBtn');
  if (mab) mab.textContent = view === 'pastes' ? '+ Paste' : '+ Upload';
};

// ── Init ──
async function init() {
  await loadFolders();
  setView('files', null);
  setInterval(() => { if (state.view === 'files') loadFiles(); }, 30000);
}

init();
