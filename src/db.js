require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'vault.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function safeAddColumn(table, column, type) {
  const cols = getDB().prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    getDB().prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

function initDB() {
  const db = getDB();

  // Core files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      share_token TEXT UNIQUE NOT NULL,
      download_count INTEGER DEFAULT 0,
      max_downloads INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      notes TEXT
    );
  `);

  // Migrate: add new columns safely
  safeAddColumn('files', 'folder_id', 'TEXT');
  safeAddColumn('files', 'file_hash', 'TEXT');
  safeAddColumn('files', 'version', 'INTEGER DEFAULT 1');

  // Folders
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Pastes
  db.exec(`
    CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'plaintext',
      share_token TEXT UNIQUE NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      view_count INTEGER DEFAULT 0,
      burn_after_read INTEGER DEFAULT 0
    );
  `);

  // Download events for analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      file_name TEXT,
      downloaded_at INTEGER NOT NULL
    );
  `);

  // Upload events for analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      file_name TEXT,
      file_size INTEGER,
      uploaded_at INTEGER NOT NULL
    );
  `);

  console.log('✅ Database initialized');
}

// ── Files ──
function getAllFiles(folderId) {
  if (folderId === 'none') {
    return getDB().prepare(`SELECT * FROM files WHERE folder_id IS NULL ORDER BY created_at DESC`).all();
  }
  if (folderId) {
    return getDB().prepare(`SELECT * FROM files WHERE folder_id = ? ORDER BY created_at DESC`).all(folderId);
  }
  return getDB().prepare(`SELECT * FROM files ORDER BY created_at DESC`).all();
}

function getFileByToken(token) {
  return getDB().prepare(`SELECT * FROM files WHERE share_token = ?`).get(token);
}

function getFileById(id) {
  return getDB().prepare(`SELECT * FROM files WHERE id = ?`).get(id);
}

function getFileByHash(hash) {
  return getDB().prepare(`SELECT * FROM files WHERE file_hash = ?`).get(hash);
}

function insertFile(file) {
  return getDB().prepare(`
    INSERT INTO files (id, original_name, stored_name, mime_type, size, share_token, max_downloads, expires_at, created_at, notes, folder_id, file_hash, version)
    VALUES (@id, @original_name, @stored_name, @mime_type, @size, @share_token, @max_downloads, @expires_at, @created_at, @notes, @folder_id, @file_hash, @version)
  `).run(file);
}

function updateFileVersion(id, updates) {
  return getDB().prepare(`
    UPDATE files SET original_name=@original_name, stored_name=@stored_name, mime_type=@mime_type, size=@size, file_hash=@file_hash, version=@version, download_count=0
    WHERE id=@id
  `).run({ ...updates, id });
}

function renameFile(id, name) {
  return getDB().prepare(`UPDATE files SET original_name = ? WHERE id = ?`).run(name, id);
}

function updateFileSettings(id, updates) {
  return getDB().prepare(`
    UPDATE files SET expires_at=@expires_at, max_downloads=@max_downloads, notes=@notes, folder_id=@folder_id WHERE id=@id
  `).run({ ...updates, id });
}

function incrementDownload(token) {
  return getDB().prepare(`UPDATE files SET download_count = download_count + 1 WHERE share_token = ?`).run(token);
}

function deleteFileRecord(id) {
  return getDB().prepare(`DELETE FROM files WHERE id = ?`).run(id);
}

function bulkDeleteFiles(ids) {
  const del = getDB().prepare(`DELETE FROM files WHERE id = ?`);
  const tx = getDB().transaction((ids) => { for (const id of ids) del.run(id); });
  tx(ids);
}

// ── Folders ──
function getAllFolders() {
  return getDB().prepare(`SELECT *, (SELECT COUNT(*) FROM files WHERE folder_id = folders.id) as file_count FROM folders ORDER BY name ASC`).all();
}

function getFolderById(id) {
  return getDB().prepare(`SELECT * FROM folders WHERE id = ?`).get(id);
}

function insertFolder(folder) {
  return getDB().prepare(`INSERT INTO folders (id, name, created_at) VALUES (@id, @name, @created_at)`).run(folder);
}

function deleteFolderRecord(id) {
  // Move files out of folder first
  getDB().prepare(`UPDATE files SET folder_id = NULL WHERE folder_id = ?`).run(id);
  return getDB().prepare(`DELETE FROM folders WHERE id = ?`).run(id);
}

// ── Pastes ──
function getAllPastes() {
  return getDB().prepare(`SELECT * FROM pastes ORDER BY created_at DESC`).all();
}

function getPasteByToken(token) {
  return getDB().prepare(`SELECT * FROM pastes WHERE share_token = ?`).get(token);
}

function getPasteById(id) {
  return getDB().prepare(`SELECT * FROM pastes WHERE id = ?`).get(id);
}

function insertPaste(paste) {
  return getDB().prepare(`
    INSERT INTO pastes (id, title, content, language, share_token, expires_at, created_at, burn_after_read)
    VALUES (@id, @title, @content, @language, @share_token, @expires_at, @created_at, @burn_after_read)
  `).run(paste);
}

function incrementPasteViews(token) {
  return getDB().prepare(`UPDATE pastes SET view_count = view_count + 1 WHERE share_token = ?`).run(token);
}

function deletePasteRecord(id) {
  return getDB().prepare(`DELETE FROM pastes WHERE id = ?`).run(id);
}

// ── Events ──
function logDownload(fileId, fileName) {
  return getDB().prepare(`INSERT INTO download_events (file_id, file_name, downloaded_at) VALUES (?, ?, ?)`).run(fileId, fileName, Date.now());
}

function logUpload(fileId, fileName, fileSize) {
  return getDB().prepare(`INSERT INTO upload_events (file_id, file_name, file_size, uploaded_at) VALUES (?, ?, ?, ?)`).run(fileId, fileName, fileSize, Date.now());
}

// ── Cleanup ──
function deleteExpiredFiles() {
  const now = Date.now();

  const expiredFiles = getDB().prepare(`SELECT * FROM files WHERE expires_at IS NOT NULL AND expires_at < ?`).all(now);
  for (const file of expiredFiles) {
    const fp = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    deleteFileRecord(file.id);
    console.log(`🗑️ Expired file deleted: ${file.original_name}`);
  }

  const maxedFiles = getDB().prepare(`SELECT * FROM files WHERE max_downloads IS NOT NULL AND download_count >= max_downloads`).all();
  for (const file of maxedFiles) {
    const fp = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    deleteFileRecord(file.id);
    console.log(`🗑️ Max-download file deleted: ${file.original_name}`);
  }

  const expiredPastes = getDB().prepare(`SELECT * FROM pastes WHERE expires_at IS NOT NULL AND expires_at < ?`).all(now);
  for (const paste of expiredPastes) {
    deletePasteRecord(paste.id);
    console.log(`🗑️ Expired paste deleted: ${paste.title || paste.id}`);
  }
}

// ── Stats ──
function getStats() {
  const db = getDB();
  const totalFiles = db.prepare(`SELECT COUNT(*) as c FROM files`).get().c;
  const totalSize = db.prepare(`SELECT SUM(size) as s FROM files`).get().s || 0;
  const totalDownloads = db.prepare(`SELECT SUM(download_count) as d FROM files`).get().d || 0;
  const totalPastes = db.prepare(`SELECT COUNT(*) as c FROM pastes`).get().c;

  // Uploads per day (last 30 days)
  const uploadsPerDay = db.prepare(`
    SELECT date(uploaded_at/1000, 'unixepoch') as day, COUNT(*) as count
    FROM upload_events
    WHERE uploaded_at > ?
    GROUP BY day ORDER BY day ASC
  `).all(Date.now() - 30 * 86400000);

  // Downloads per day (last 30 days)
  const downloadsPerDay = db.prepare(`
    SELECT date(downloaded_at/1000, 'unixepoch') as day, COUNT(*) as count
    FROM download_events
    WHERE downloaded_at > ?
    GROUP BY day ORDER BY day ASC
  `).all(Date.now() - 30 * 86400000);

  // Top 8 most downloaded
  const topFiles = db.prepare(`
    SELECT original_name, download_count FROM files
    ORDER BY download_count DESC LIMIT 8
  `).all();

  return { totalFiles, totalSize, totalDownloads, totalPastes, uploadsPerDay, downloadsPerDay, topFiles };
}

module.exports = {
  initDB, getDB, UPLOADS_DIR,
  getAllFiles, getFileByToken, getFileById, getFileByHash,
  insertFile, updateFileVersion, renameFile, updateFileSettings,
  incrementDownload, deleteFileRecord, bulkDeleteFiles, deleteExpiredFiles,
  getAllFolders, getFolderById, insertFolder, deleteFolderRecord,
  getAllPastes, getPasteByToken, getPasteById, insertPaste, incrementPasteViews, deletePasteRecord,
  logDownload, logUpload, getStats
};
