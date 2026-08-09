// Cohort norms (auto-generated per import) + tunable settings (redesign spec §6).
// Norms are editable by admins and by medical staff who hold the
// `editCohortNorms` capability; the tunable settings + queue governance stay
// admin-only.
const express = require('express');
const { recordAudit } = require('../utils/audit');
const { CohortThreshold, Athlete, CohortNormVersion } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const {
  recomputeCohorts, cohortReview,
  latestScreeningsByAthlete, tierKeysFor, isEligibleForNorms, cohortKeyOf,
} = require('../utils/cohorts');
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

// ── Norm versions (B1): name, list, rename, restore, delete a saved norm set ──
// Defined before /:id so "versions" is never captured as an :id.

// POST /api/cohorts/versions — snapshot the current cohort norms under a name.
router.post('/versions', auth, rbac('admin', 'medical'), canEditNorms, async (req, res) => {
  try {
    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ message: 'A name is required.' });
    const rows = await CohortThreshold.findAll({ raw: true });
    const snapshot = rows.map((r) => ({
      tier: r.tier, sport: r.sport, programme: r.programme, gender: r.gender, discipline: r.discipline,
      n: r.n, stats: r.stats, overrides: r.overrides, status: r.status,
    }));
    const v = await CohortNormVersion.create({
      label, note: String(req.body.note || '').trim() || null, createdBy: req.user?.name || null, snapshot,
    });
    res.json({ id: v.id, label: v.label, cohorts: snapshot.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/cohorts/versions — saved versions (metadata only, no snapshot payload).
router.get('/versions', auth, rbac('admin', 'medical'), canEditNorms, async (_req, res) => {
  try {
    const rows = await CohortNormVersion.findAll({ order: [['createdAt', 'DESC']] });
    res.json(rows.map((r) => {
      const s = r.get({ plain: true });
      return { id: s.id, label: s.label, note: s.note, createdBy: s.createdBy, createdAt: s.createdAt, cohorts: Array.isArray(s.snapshot) ? s.snapshot.length : 0 };
    }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/versions/:id', auth, rbac('admin', 'medical'), canEditNorms, async (req, res) => {
  try {
    const v = await CohortNormVersion.findByPk(req.params.id);
    if (!v) return res.status(404).json({ message: 'Version not found' });
    if (req.body.label !== undefined) {
      const l = String(req.body.label).trim();
      if (!l) return res.status(400).json({ message: 'Name cannot be empty.' });
      await v.update({ label: l });
    }
    res.json({ id: v.id, label: v.label });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/versions/:id/restore — upsert a saved snapshot onto the live
// cohorts (restore n/stats/overrides/status by key), then re-score. Admin-only
// (it replaces the whole norm set).
router.post('/versions/:id/restore', auth, rbac('admin'), async (req, res) => {
  try {
    const v = await CohortNormVersion.findByPk(req.params.id, { raw: true });
    if (!v) return res.status(404).json({ message: 'Version not found' });
    const snap = Array.isArray(v.snapshot) ? v.snapshot : [];
    const existing = await CohortThreshold.findAll();
    const byKey = new Map(existing.map((r) => [cohortKeyOf(r), r]));
    const ops = snap.map((s) => {
      const patch = { n: s.n, stats: s.stats, overrides: s.overrides, status: s.status };
      const cur = byKey.get(cohortKeyOf(s));
      return cur
        ? cur.update(patch)
        : CohortThreshold.create({ tier: s.tier, sport: s.sport, programme: s.programme, gender: s.gender, discipline: s.discipline || null, ...patch, computedAt: new Date() });
    });
    await Promise.all(ops);
    const indicators = await recomputeIndicators();
    recordAudit(req, {
      action: 'norm.restore',
      entity: 'normVersion',
      entityId: req.params.id,
      summary: `Restored saved norm set "${v.label}" over the live norms (${snap.length} cohorts)`,
      meta: { cohorts: snap.length, rescored: indicators },
    });
    res.json({ message: 'Restored', restored: snap.length, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/versions/:id', auth, rbac('admin'), async (req, res) => {
  try {
    const n = await CohortNormVersion.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ message: 'Version not found' });
    res.json({ message: 'Deleted' });
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

// GET /api/cohorts/:id/members — the athletes in this cohort tier, each with
// their latest headline scores, risk band, and norm-membership state (B3/B4/B5):
// eligible + reason (injured / excluded / below-threshold). Drives the admin
// per-cohort membership panel. Admin + norm-editing medical.
router.get('/:id/members', auth, rbac('admin', 'medical'), canEditNorms, async (req, res) => {
  try {
    const row = await CohortThreshold.findByPk(req.params.id, { raw: true });
    if (!row) return res.status(404).json({ message: 'Cohort not found' });
    const settings = await getSettings();
    const rowKey = cohortKeyOf(row);
    const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    const rows = await latestScreeningsByAthlete();
    const members = rows
      .filter(({ athlete }) => tierKeysFor(athlete).some((k) => cohortKeyOf(k) === rowKey))
      .map(({ athlete, screening }) => {
        const elig = isEligibleForNorms(athlete, screening, settings);
        return {
          athleteId: athlete.athleteId, name: athlete.name, sport: athlete.sport,
          program: athlete.program, gender: athlete.gender,
          isInjured: !!athlete.isInjured, normExcluded: !!athlete.normExcluded,
          totalScore: num(screening.totalScore), rom: num(screening.rom),
          stability: num(screening.stability), symmetry: num(screening.symmetry),
          overallBand: screening.overrideBand || screening.overallBand,
          overallIndicator: num(screening.overallIndicator),
          eligible: elig.eligible, reason: elig.reason,
        };
      })
      .sort((a, b) => (Number(b.eligible) - Number(a.eligible)) || a.name.localeCompare(b.name));
    res.json({
      cohort: row,
      members,
      thresholds: { total: settings.norm_min_total, rom: settings.norm_min_rom, stability: settings.norm_min_stability },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/cohorts/members/:athleteId — toggle an athlete's manual norm
// opt-out (B3). Takes effect on the next recompute (staged like norm edits).
router.patch('/members/:athleteId', auth, rbac('admin', 'medical'), canEditNorms, async (req, res) => {
  try {
    const a = await Athlete.findByPk(req.params.athleteId);
    if (!a) return res.status(404).json({ message: 'Athlete not found' });
    if (req.body.normExcluded !== undefined) {
      await a.update({ normExcluded: !!req.body.normExcluded });
      recordAudit(req, {
        action: 'norm.member',
        entity: 'athlete',
        entityId: a.athleteId,
        summary: `${a.normExcluded ? 'Excluded' : 'Re-included'} ${a.name || a.athleteId} `
          + `${a.normExcluded ? 'from' : 'in'} norm calculation`,
        meta: { normExcluded: a.normExcluded },
      });
    }
    res.json({ athleteId: a.athleteId, normExcluded: a.normExcluded });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/settings — current settings merged over defaults. Readable by admin
// and norm-editing medical staff (the Cohort Norms page needs min_cohort_n etc.
// to render); WRITING settings stays admin-only below.
router.get('/settings/all', auth, rbac('admin', 'medical'), canEditNorms, async (_req, res) => {
  try {
    res.json({ settings: await getSettings(), defaults: DEFAULTS });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/settings/all', auth, rbac('admin'), async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in DEFAULTS) await setSetting(k, v);
    }
    const indicators = await recomputeIndicators();
    recordAudit(req, {
      action: 'settings.update',
      entity: 'settings',
      summary: `Changed norm settings: ${Object.keys(req.body || {}).filter((k) => k in DEFAULTS).join(', ') || 'none'}`,
      meta: { changed: req.body || null, rescored: indicators },
    });
    res.json({ settings: await getSettings(), indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
