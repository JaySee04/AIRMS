// Cohort norms (auto-generated per import) + tunable settings (redesign spec §6).
// Norms are editable by admins and by medical staff who hold the
// `editCohortNorms` capability; the tunable settings + queue governance stay
// admin-only.
const express = require('express');
const { CohortThreshold } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { recomputeCohorts, cohortReview } = require('../utils/cohorts');
const { recomputeIndicators } = require('../utils/overallIndicator');
const { getSettings, setSetting, DEFAULTS } = require('../utils/settings');
const { hasPermission } = require('../utils/permissions');

const router = express.Router();

// admin, or a medical staffer who still holds the editCohortNorms capability.
const canEditNorms = (req, res, next) => {
  const u = req.user;
  if (u && (u.role === 'admin' || (u.role === 'medical' && hasPermission(u, 'editCohortNorms')))) return next();
  return res.status(403).json({ message: 'Editing cohort norms requires the editCohortNorms capability.' });
};

// GET /api/cohorts — all cohort rows, each annotated with a `review` drift flag
// (manual norm vs freshly computed data). Admin + norm-editing medical staff.
router.get('/', auth, rbac('admin', 'medical'), canEditNorms, async (_req, res) => {
  try {
    const rows = await CohortThreshold.findAll({
      order: [['tier', 'ASC'], ['sport', 'ASC'], ['programme', 'ASC'], ['gender', 'ASC']],
    });
    res.json(rows.map((r) => ({ ...r.get({ plain: true }), review: cohortReview(r) })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/recompute — regenerate cohort norms from latest screenings,
// then re-score every athlete's overall indicator. Admin + norm-editing medical.
router.post('/recompute', auth, rbac('admin', 'medical'), canEditNorms, async (_req, res) => {
  try {
    const cohorts = await recomputeCohorts();
    const indicators = await recomputeIndicators();
    res.json({ message: 'Recomputed', cohorts, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/cohorts/:id — edit the norm (overrides) or, admin-only, move it
// through the queue (approve/revert). Editing stores overrides (the computed
// values are pre-filled client-side) and keeps the norm live.
router.patch('/:id', auth, rbac('admin', 'medical'), canEditNorms, async (req, res) => {
  try {
    const row = await CohortThreshold.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Cohort not found' });
    const patch = {};
    if (req.body.overrides !== undefined) patch.overrides = req.body.overrides;
    // Queue governance (approve/revert) stays admin-only; medical staff may edit
    // the norm values but not change a cohort's approval status.
    const wantsStatusChange = req.body.status === 'approved' || req.body.status === 'pending';
    if (wantsStatusChange && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Only an admin can change a cohort’s approval status.' });
    }
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
