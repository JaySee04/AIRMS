// Screening history + clinician override (redesign spec §3.4, §5).
const express = require('express');
const { Screening } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');

const router = express.Router();

// GET /api/screenings/athlete/:id — full history (newest first). Athletes may
// read their own; medical/admin any (medical gated by viewRecords).
router.get('/athlete/:id', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const rows = await Screening.findAll({
      where: { athleteId: req.params.id },
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/screenings/:id/override — clinician sets the effective band after a
// real assessment (e.g. an amber athlete checked and cleared to green). A note
// is required. The override auto-expires when a newer screening is imported
// (new row, no override). Medical staff only.
router.patch('/:id/override', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { band, note } = req.body || {};
    const row = await Screening.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Screening not found' });
    if (band && !['green', 'amber', 'red'].includes(band)) {
      return res.status(400).json({ message: 'band must be green, amber, or red' });
    }
    if (band && !String(note || '').trim()) {
      return res.status(400).json({ message: 'A note is required when overriding the risk band.' });
    }
    if (band) {
      await row.update({ overrideBand: band, overrideNote: String(note).trim(), overrideBy: req.user?.name || null, overrideAt: new Date() });
    } else {
      // Clear the override.
      await row.update({ overrideBand: null, overrideNote: null, overrideBy: null, overrideAt: null });
    }
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
