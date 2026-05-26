const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'vault.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

// Ensure directories exist
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initDB() {
  const db = getDB();
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
  console.log('✅ Database initialized');
}

function getAllFiles() {
  return getDB().prepare(`
    SELECT * FROM files ORDER BY created_at DESC
  `).all();
}

function getFileByToken(token) {
  return getDB().prepare(`
    SELECT * FROM files WHERE share_token = ?
  `).get(token);
}

function getFileById(id) {
  return getDB().prepare(`SELECT * FROM files WHERE id = ?`).get(id);
}

function insertFile(file) {
  return getDB().prepare(`
    INSERT INTO files (id, original_name, stored_name, mime_type, size, share_token, max_downloads, expires_at, created_at, notes)
    VALUES (@id, @original_name, @stored_name, @mime_type, @size, @share_token, @max_downloads, @expires_at, @created_at, @notes)
  `).run(file);
}

function incrementDownload(token) {
  return getDB().prepare(`
    UPDATE files SET download_count = download_count + 1 WHERE share_token = ?
  `).run(token);
}

function deleteFileRecord(id) {
  return getDB().prepare(`DELETE FROM files WHERE id = ?`).run(id);
}

function deleteExpiredFiles() {
  const now = Date.now();
  const expired = getDB().prepare(`
    SELECT * FROM files WHERE expires_at IS NOT NULL AND expires_at < ?
  `).all(now);

  for (const file of expired) {
    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    deleteFileRecord(file.id);
    console.log(`🗑️ Deleted expired file: ${file.original_name}`);
  }

  // Also delete files that exceeded max downloads
  const maxedOut = getDB().prepare(`
    SELECT * FROM files WHERE max_downloads IS NOT NULL AND download_count >= max_downloads
  `).all();

  for (const file of maxedOut) {
    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    deleteFileRecord(file.id);
    console.log(`🗑️ Deleted maxed-out file: ${file.original_name}`);
  }
}

module.exports = { initDB, getAllFiles, getFileByToken, getFileById, insertFile, incrementDownload, deleteFileRecord, deleteExpiredFiles, UPLOADS_DIR };
