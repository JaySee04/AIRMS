// ISN directory integration (A3). Thin routes over the mock ISN athlete
// directory (utils seam in ../mock/isnDirectory) — used when an operator needs
// an athlete AIRMS has never seen: look them up in ISN, pull their master
// record, and create the AIRMS athlete pre-filled. Swapping the mock for the
// real ISN source changes only ../mock/isnDirectory, not these routes.
const express = require('express');
const { Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { searchIsn, getIsnByIC } = require('../mock/isnDirectory');

const router = express.Router();

// GET /api/isn/athletes?q= — search ISN by name or IC. Each result is annotated
// with `inRoster` (already an AIRMS athlete, matched on the IC key) so the UI can
// tell "import as new" from "already here". Medical + admin operators.
router.get('/athletes', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const results = searchIsn(req.query.q, { limit: 20 });
    const ics = results.map((r) => r.icNumber);
    const existing = ics.length
      ? new Set((await Athlete.findAll({ where: { athleteId: ics }, attributes: ['athleteId'], raw: true })).map((a) => a.athleteId))
      : new Set();
    res.json(results.map((r) => ({ ...r, inRoster: existing.has(r.icNumber) })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/isn/athletes/:ic — one ISN athlete by IC, or 404.
router.get('/athletes/:ic', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const rec = getIsnByIC(req.params.ic);
    if (!rec) return res.status(404).json({ message: 'Not found in the ISN directory' });
    const existing = await Athlete.findOne({ where: { athleteId: rec.icNumber }, attributes: ['athleteId'], raw: true });
    res.json({ ...rec, inRoster: Boolean(existing) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
