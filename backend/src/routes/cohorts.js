// Cohort norms (auto-generated per import) + tunable settings (redesign spec §6).
// Norms are editable by admins and by medical staff who hold the
// `editCohortNorms` capability; the tunable settings + queue governance stay
// admin-only.
const express = require('express');
const { recordAudit } = require('../utils/audit');
const { recomputeAll } = require('../utils/recompute');
const { CohortThreshold, Athlete, CohortNormVersion } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const {
  cohortReview, pinDrift,
  latestScreeningsByAthlete, tierKeysFor, isEligibleForNorms, cohortKeyOf,
} = require('../utils/cohorts');
const {
  getSettings, setSetting, DEFAULTS, appliedSettingChanges,
} = require('../utils/settings');
const { hasPermission } = require('../utils/permissions');
const { effectiveBand } = require('../utils/bands');
const { runDigestOnce, runReminderOnce } = require('../utils/scheduler');

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
    const [rows, settings] = await Promise.all([
      CohortThreshold.findAll({
        order: [['tier', 'ASC'], ['sport', 'ASC'], ['programme', 'ASC'], ['gender', 'ASC']],
      }),
      getSettings(),
    ]);
    const pinnedId = settings.pinned_norm_version_id ?? null;
    const pinnedVersion = pinnedId === null ? null
      : await CohortNormVersion.findByPk(pinnedId, { attributes: ['id', 'label', 'createdBy', 'createdAt'], raw: true });
    res.json({
      // The pin belongs in the SAME payload as the rows: a client that had to ask
      // separately could render the numbers before it knew they were held, which
      // is the one state this feature must never present silently.
      pin: pinnedVersion ? { ...pinnedVersion, active: true } : null,
      cohorts: rows.map((r) => ({
        ...r.get({ plain: true }),
        review: cohortReview(r),
        drift: pinDrift(r),
      })),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/recompute — regenerate cohort norms from latest screenings,
// then re-score every athlete's overall indicator. Admin + norm-editing medical.
router.post('/recompute', auth, rbac('admin', 'medical'), canEditNorms, async (_req, res) => {
  try {
    const { cohorts, indicators } = await recomputeAll();
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
    const [rows, settings] = await Promise.all([
      CohortNormVersion.findAll({ order: [['createdAt', 'DESC']] }),
      getSettings(),
    ]);
    const pinnedId = settings.pinned_norm_version_id ?? null;
    res.json({
      pinnedId: pinnedId === null ? null : Number(pinnedId),
      versions: rows.map((r) => {
        const s = r.get({ plain: true });
        return {
          id: s.id, label: s.label, note: s.note, createdBy: s.createdBy, createdAt: s.createdAt,
          cohorts: Array.isArray(s.snapshot) ? s.snapshot.length : 0,
          pinned: String(pinnedId ?? '') === String(s.id),
        };
      }),
    });
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
    // Restoring while another version is pinned would install one set of numbers
    // and leave the pin naming a different one — the page would then claim norms
    // are held to a version that is not what the athletes are scored against.
    // Refusing is the honest option, and it is also exactly what a pin is for.
    const st = await getSettings();
    if ((st.pinned_norm_version_id ?? null) !== null && String(st.pinned_norm_version_id) !== String(v.id)) {
      return res.status(409).json({ message: 'A norm version is pinned. Release the pin, or pin this version instead, to change the norms in force.' });
    }
    // Same installer the pin uses — restore and pin differ only in whether the
    // norms are then HELD, so they must not have two ideas of what installing is.
    const snap = await applySnapshot(v);
    const { indicators } = await recomputeAll({ cohorts: false });
    recordAudit(req, {
      action: 'norm.restore',
      entity: 'normVersion',
      entityId: req.params.id,
      summary: `Restored saved norm set "${v.label}" over the live norms (${snap} cohorts)`,
      meta: { cohorts: snap, rescored: indicators },
    });
    res.json({ message: 'Restored', restored: snap, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Pinning: which saved version is IN FORCE ────────────────────────────────
//
// Saving a version is an ARCHIVE; pinning is governance. While a version is
// pinned `recomputeCohorts` HOLDS its numbers instead of overwriting them, so an
// import cannot quietly move the norm every athlete is scored against — without
// which "institution-governed norms" is only true between imports.
//
// Pinning deliberately REUSES restore: "in force" has to mean the live rows
// ARE the snapshot, so scoring keeps reading cohort_thresholds and no second
// place decides which numbers apply.
async function applySnapshot(version) {
  const snap = Array.isArray(version.snapshot) ? version.snapshot : [];
  const existing = await CohortThreshold.findAll();
  const byKey = new Map(existing.map((r) => [cohortKeyOf(r), r]));
  await Promise.all(snap.map((s) => {
    const patch = {
      n: s.n, stats: s.stats, overrides: s.overrides, status: s.status,
      // A freshly applied snapshot has not drifted yet.
      freshStats: null, freshN: null, freshAt: null, addedSincePin: false,
    };
    const cur = byKey.get(cohortKeyOf(s));
    return cur
      ? cur.update(patch)
      : CohortThreshold.create({
        tier: s.tier, sport: s.sport, programme: s.programme, gender: s.gender, discipline: s.discipline || null, ...patch, computedAt: new Date(),
      });
  }));
  return snap.length;
}

// POST /api/cohorts/versions/:id/pin — put a saved version in force.
router.post('/versions/:id/pin', auth, rbac('admin'), async (req, res) => {
  try {
    const v = await CohortNormVersion.findByPk(req.params.id, { raw: true });
    if (!v) return res.status(404).json({ message: 'Version not found' });
    const cohorts = await applySnapshot(v);
    // Set the pin AFTER applying, so a failure mid-apply cannot leave a pin
    // pointing at norms that were never installed.
    await setSetting('pinned_norm_version_id', v.id);
    const { indicators } = await recomputeAll({ cohorts: false });
    recordAudit(req, {
      action: 'norm.pin',
      entity: 'normVersion',
      entityId: String(v.id),
      summary: `Pinned norm set "${v.label}" — imports will no longer change the norms (${cohorts} cohorts)`,
      meta: { cohorts, rescored: indicators },
    });
    res.json({ message: 'Pinned', pinnedId: v.id, cohorts, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/versions/unpin — release the pin and let the norms track the
// data again. Recomputes immediately rather than waiting for the next import,
// because "released" should be visible now, not whenever a report happens to land.
router.post('/versions/unpin', auth, rbac('admin'), async (req, res) => {
  try {
    const settings = await getSettings();
    const wasId = settings.pinned_norm_version_id ?? null;
    if (wasId === null) return res.status(400).json({ message: 'No norm version is pinned.' });
    const prev = await CohortNormVersion.findByPk(wasId, { raw: true });
    await setSetting('pinned_norm_version_id', null);
    const { cohorts, indicators } = await recomputeAll();
    recordAudit(req, {
      action: 'norm.unpin',
      entity: 'normVersion',
      entityId: String(wasId),
      summary: `Released the pinned norm set${prev ? ` "${prev.label}"` : ''} — the norms now follow the data again`,
      meta: { cohorts, rescored: indicators },
    });
    res.json({ message: 'Released', cohorts, indicators });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/versions/:id', auth, rbac('admin'), async (req, res) => {
  try {
    // Deleting the version in force would leave the norms held by a pin that
    // points at nothing — the live rows would stay frozen with no way to see what
    // they are frozen to. Release it first, deliberately.
    const settings = await getSettings();
    if (String(settings.pinned_norm_version_id ?? '') === String(req.params.id)) {
      return res.status(409).json({ message: 'This version is pinned. Release the pin before deleting it.' });
    }
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
    const { indicators } = await recomputeAll({ cohorts: false });
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
          // WHO declared the injury, and when. The panel could say an athlete was
          // excluded but not on whose judgement — which is the part an admin
          // reviewing the norm actually needs to follow up on.
          injuryBy: athlete.injuryBy || null,
          injuryAt: athlete.injuryAt || null,
          injuryNote: athlete.injuryNote || null,
          importedBy: screening.importedBy || null,
          totalScore: num(screening.totalScore), rom: num(screening.rom),
          stability: num(screening.stability), symmetry: num(screening.symmetry),
          overallBand: effectiveBand(screening),
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
    let recomputed = null;
    if (req.body.normExcluded !== undefined) {
      await a.update({ normExcluded: !!req.body.normExcluded });
      // Changing who COUNTS changes the norm, so recompute here rather than at
      // the next import — deferred, the exclusion applies to eligibility while
      // the published norm still includes them. Awaited, not queued: the admin is
      // looking at the table and expects the numbers to move with the tick.
      const { cohorts, indicators } = await recomputeAll();
      recomputed = { cohorts, indicators };
      recordAudit(req, {
        action: 'norm.member',
        entity: 'athlete',
        entityId: a.athleteId,
        summary: `${a.normExcluded ? 'Excluded' : 'Re-included'} ${a.name || a.athleteId} `
          + `${a.normExcluded ? 'from' : 'in'} norm calculation`,
        meta: { normExcluded: a.normExcluded, cohorts, indicators },
      });
    }
    res.json({ athleteId: a.athleteId, normExcluded: a.normExcluded, recomputed });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/cohorts/settings/mail/:kind/send-now — run a scheduled email NOW.
//
// The page already offered "send again at the next hourly check", which clears
// the month marker and waits. That is the right control for correcting a missed
// month and the wrong one for the two cases that actually come up: showing the
// feature works, and an administrator who wants this month's report today. An
// hour is not a wait, it is a reason not to use it.
//
// `force` skips only the DUE check. `digest_enabled` / `rescreen_reminder_enabled`
// still gate — the institution switch decides whether AIRMS sends this kind of
// mail at all, and a button that overrode it would be a second, contradictory
// gate on the same question (the same two-gates-in-order rule the per-user
// opt-out follows).
//
// Audited as `mail.send`, and deliberately NOT as `settings.update`: it changes
// no setting, and it is the one action here that puts athlete-derived content
// into somebody's inbox. Recording that under a settings label would misdescribe
// the most consequential thing on this page.
router.post('/settings/mail/:kind/send-now', auth, rbac('admin'), async (req, res) => {
  const { kind } = req.params;
  if (kind !== 'digest' && kind !== 'reminder') {
    return res.status(400).json({ message: 'Unknown mail kind.' });
  }
  try {
    const result = kind === 'digest'
      ? await runDigestOnce(new Date(), { force: true })
      : await runReminderOnce(new Date(), { force: true });

    // Logged whatever the outcome, including "disabled" and "no recipients" —
    // an administrator pressing send and nothing arriving is exactly the event
    // somebody later needs explained.
    recordAudit(req, {
      action: 'mail.send',
      entity: 'settings',
      summary: kind === 'digest'
        ? `Sent the monthly summary now: ${result.sent ? `${result.recipients} recipient(s)` : result.reason}`
        : `Sent the rescreen reminder now: ${result.sent ? `${result.emails} email(s)` : result.reason}`,
      meta: { kind, ...result },
    });
    res.json({ kind, ...result, settings: await getSettings() });
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

// A PATCH that changes nothing writes nothing, rescores nothing and logs
// nothing. `appliedSettingChanges` decides that (utils/settings.js), where it
// can be tested; the alternative was an audit row asserting "Norm settings
// changed" for a request that wrote no setting, in the one trail the
// institution would rely on to prove what moved the norms.
router.patch('/settings/all', auth, rbac('admin'), async (req, res) => {
  try {
    const before = await getSettings();
    const changed = appliedSettingChanges(before, req.body);
    if (!changed.length) {
      return res.json({ settings: before, indicators: null, changed: [] });
    }
    for (const k of changed) await setSetting(k, req.body[k]);
    const { indicators } = await recomputeAll({ cohorts: false });
    recordAudit(req, {
      action: 'settings.update',
      entity: 'settings',
      summary: `Changed norm settings: ${changed.join(', ')}`,
      meta: {
        changed: Object.fromEntries(changed.map((k) => [k, req.body[k]])),
        rescored: indicators,
      },
    });
    res.json({ settings: await getSettings(), indicators, changed });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
