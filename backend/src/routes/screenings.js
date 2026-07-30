// Screening history + clinician override (redesign spec §3.4, §5).
const express = require('express');
const { Screening, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { notifyOverrideToCoach } = require('../utils/notifications');

const router = express.Router();

// GET /api/screenings/athlete/:id — full history (newest first). Athletes may
// read their own; coaches athletes in their assigned sport; medical/admin any
// (medical gated by viewRecords).
router.get('/athlete/:id', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user.role === 'coach') {
      const athlete = await Athlete.findOne({ where: { athleteId: req.params.id }, attributes: ['sport'], raw: true });
      if (!athlete || athlete.sport !== req.user.coachSport) {
        return res.status(403).json({ message: 'Coaches can only view screening history for athletes in their assigned sport.' });
      }
    }
    // Summary columns only — the heavy per-report detail (subitems, posture,
    // summary text) stays on the latest-screening fetch and the PDF.
    const rows = await Screening.findAll({
      where: { athleteId: req.params.id },
      attributes: [
        'id', 'assessedAt', 'importedBy',
        'totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks',
        'overallIndicator', 'overallBand', 'overrideBand', 'overrideBy',
      ],
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
      // Tell the athlete's coach an escalation was set by medical (fire-and-
      // forget; only amber/red notify — notifyOverrideToCoach gates on that).
      const athlete = await Athlete.findOne({ where: { athleteId: row.athleteId }, attributes: ['name', 'sport'], raw: true });
      if (athlete) notifyOverrideToCoach(athlete, band, String(note).trim(), req.user?.name);
    } else {
      // Clear the override.
      await row.update({ overrideBand: null, overrideNote: null, overrideBy: null, overrideAt: null });
    }
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
