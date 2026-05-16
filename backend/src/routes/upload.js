const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Athlete = require('../models/Athlete');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are accepted'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// POST /api/upload/screening — import athlete screening data from Excel
router.post('/screening', auth, rbac('medical', 'admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const results = { created: 0, updated: 0, errors: [] };

    for (const row of rows) {
      try {
        const athleteId = String(row['Athlete ID'] || row['athleteId'] || '').trim();
        if (!athleteId) { results.errors.push({ row, reason: 'Missing Athlete ID' }); continue; }

        const data = {
          athleteId,
          name: row['Name'] || row['name'],
          age: row['Age'],
          gender: row['Gender'],
          weight: row['Weight (kg)'] || row['weight'],
          height: row['Height (cm)'] || row['height'],
          sport: row['Sport'] || row['sport'],
          program: row['Program'] || row['program'],
          overallActivityScore: row['Overall Activity Score'],
          injuryRiskIndex: row['Injury Risk Index'],
          mobility: row['Mobility'],
          stability: row['Stability'],
          symmetry: row['Symmetry'],
        };

        const existing = await Athlete.findOne({ athleteId });
        if (existing) {
          await Athlete.findOneAndUpdate({ athleteId }, data);
          results.updated++;
        } else {
          await Athlete.create(data);
          results.created++;
        }
      } catch (err) {
        results.errors.push({ row, reason: err.message });
      }
    }

    res.json({ message: 'Import complete', ...results, total: rows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
