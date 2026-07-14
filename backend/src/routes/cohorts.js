// Admin: cohort-threshold approval queue + tunable settings (redesign spec §6).
const express = require('express');
const { CohortThreshold } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { recomputeCohorts } = require('../utils/cohorts');
const { recomputeIndicators } = require('../utils/overallIndicator');
const { getSettings, setSetting, DEFAULTS } = require('../utils/settings');

const router = express.Router();

// GET /api/cohorts — all cohort-threshold rows (pending + approved).
router.get('/', auth, rbac('admin'), async (_req, res) => {
  try {
    const rows = await CohortThreshold.findAll({
      order: [['tier', 'ASC'], ['sport', 'ASC'], ['programme', 'ASC'], ['gender', 'ASC']],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/recompute — recompute cohort stats from latest screenings,
// then re-score every athlete's overall indicator.
router.post('/recompute', auth, rbac('admin'), async (_req, res) => {
  try {
    const cohorts = await recomputeCohorts();
    const indicators = await recomputeIndicators();
    res.json({ message: 'Recomputed', cohorts, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/cohorts/:id — approve, revert to pending, or edit the stats.
// Body: { status?, overrides? }. Editing stores admin overrides (the computed
// values are pre-filled client-side); approving makes the cohort norm live.
router.patch('/:id', auth, rbac('admin'), async (req, res) => {
  try {
    const row = await CohortThreshold.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Cohort not found' });
    const patch = {};
    if (req.body.overrides !== undefined) patch.overrides = req.body.overrides;
    if (req.body.status === 'approved') {
      patch.status = 'approved';
      patch.approvedAt = new Date();
      patch.approvedBy = req.user?.name || null;
    } else if (req.body.status === 'pending') {
      patch.status = 'pending';
      patch.approvedAt = null;
      patch.approvedBy = null;
    }
    await row.update(patch);
    // Approval/edit changes the norms → re-score indicators.
    const indicators = await recomputeIndicators();
    res.json({ cohort: row, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/settings — current settings merged over defaults.
router.get('/settings/all', auth, rbac('admin'), async (_req, res) => {
  try {
    res.json({ settings: await getSettings(), defaults: DEFAULTS });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/settings — update one or more settings, then re-score.
router.patch('/settings/all', auth, rbac('admin'), async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in DEFAULTS) await setSetting(k, v);
    }
    const indicators = await recomputeIndicators();
    res.json({ settings: await getSettings(), indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
