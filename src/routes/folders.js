const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getAllFolders, getFolderById, insertFolder, deleteFolderRecord } = require('../db');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.json(getAllFolders()));

router.post('/', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name required' });
  const folder = { id: uuidv4(), name: name.trim(), created_at: Date.now() };
  insertFolder(folder);
  res.json({ success: true, folder });
});

router.delete('/:id', requireAuth, (req, res) => {
  const folder = getFolderById(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  deleteFolderRecord(folder.id);
  res.json({ success: true });
});

module.exports = router;
