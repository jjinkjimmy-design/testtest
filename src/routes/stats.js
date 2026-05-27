const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStats } = require('../db');

const router = express.Router();
router.get('/', requireAuth, (req, res) => res.json(getStats()));
module.exports = router;
