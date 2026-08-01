const express = require('express');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag, Screening, AthleteDiscipline } = require('../models');

// Latest screening's overall indicator for an athlete, with the clinician
// override applied as the effective band. Returns null when no screening.
async function latestIndicator(athleteId) {
  const s = await Screening.findOne({
    where: { athleteId },
    order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  if (!s) return null;
  return {
    screeningId: s.id,
    assessedAt: s.assessedAt,
    overallIndicator: s.overallIndicator,
    overallBand: s.overallBand,
    escalations: s.escalations,
    factors: Array.isArray(s.factors) ? s.factors : [],
    subitems: s.subitems || null,
    overrideBand: s.overrideBand,
    overrideNote: s.overrideNote,
    overrideBy: s.overrideBy,
    overrideAt: s.overrideAt,
    // The band clinicians/coaches act on: an override wins until the next import.
    effectiveBand: s.overrideBand || s.overallBand,
  };
}
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { serializeAthlete, serializeAthleteList } = require('../utils/serialize');
const { cleanDisciplineList } = require('../utils/disciplines');

const router = express.Router();

// Replace an athlete's discipline rows with a clean, de-duplicated set. A
// non-array (or omitted) value is treated as "no change" by callers; an empty
// array clears the athlete's events. Kept simple (destroy + bulkCreate) to
// mirror the muscle-flag replacement pattern used above.
async function syncDisciplines(athleteId, disciplines) {
  if (!Array.isArray(disciplines)) return;
  const clean = cleanDisciplineList(disciplines);
  await AthleteDiscipline.destroy({ where: { athleteId } });
  if (clean.length) {
    await AthleteDiscipline.bulkCreate(clean.map((discipline) => ({ athleteId, discipline })));
  }
}

// GET /api/athletes — list athletes (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { sport, program, gender, discipline, search } = req.query;
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    if (search) where.name = { [Op.like]: `%${search}%` };
    // Discipline lives in a join table — resolve the matching athlete IDs first,
    // then filter the main query by them (keeps every athlete's full discipline
    // list intact for display, unlike a where on the include).
    if (discipline) {
      const owners = await AthleteDiscipline.findAll({ where: { discipline }, attributes: ['athleteId'], raw: true });
      const ids = owners.map((o) => o.athleteId);
      if (ids.length === 0) return res.json([]); // no athlete has this event
      where.athleteId = { [Op.in]: ids };
    }

    // List view omits muscle flags for payload size; disciplines are cheap and
    // drive the roster filters, so they're included (separate query, no join
    // row-multiplication).
    const rows = await Athlete.findAll({
      where,
      order: [['name', 'ASC']],
      include: [{ model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'], separate: true }],
    });
    res.json(serializeAthleteList(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/meta/sports — list of distinct sports (for filter dropdowns)
// Must be declared BEFORE /:id so Express doesn't match "meta" as an id.
router.get('/meta/sports', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const rows = await Athlete.findAll({
      attributes: ['sport'],
      group: ['sport'],
      order: [['sport', 'ASC']],
      raw: true,
    });
    res.json(rows.map((r) => r.sport).filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/meta/disciplines — distinct (sport, discipline) pairs already
// on record, so the import picker can offer "choose an existing event" as well
// as "type a new one". Declared BEFORE /:id. Scoped to active athletes.
router.get('/meta/disciplines', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const [discRows, athleteRows] = await Promise.all([
      AthleteDiscipline.findAll({ attributes: ['athleteId', 'discipline'], raw: true }),
      Athlete.findAll({ attributes: ['athleteId', 'sport'], where: { isActive: true }, raw: true }),
    ]);
    const sportBy = new Map(athleteRows.map((a) => [a.athleteId, a.sport]));
    const seen = new Set();
    const out = [];
    for (const r of discRows) {
      const sport = sportBy.get(r.athleteId);
      if (!sport || !r.discipline) continue;
      const key = `${sport}|${r.discipline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sport, discipline: r.discipline });
    }
    out.sort((a, b) => a.sport.localeCompare(b.sport) || a.discipline.localeCompare(b.discipline));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/analytics/screening — cohort view of the ingested
// HoloMotion screening data (admin analytics). Declared BEFORE /:id.
// Returns, across active athletes:
//   - screened / unscreened counts (screened = any headline score present)
//   - per-indicator Low / Watch / Elevated counts (AIRMS bands: ≤15 / ≤25 />25).
//     The band WORDS live on the frontend (lib/screeningAlerts.ts BAND_LABEL) —
//     keep the boundaries here in step with that file and with the PDF reports
//     (routes/screeningReports.js RISK_ZONES). All three describe the same
//     numbers and must not contradict each other.
//   - cohort averages for the five headline gauges
//   - most-flagged muscles for each flag type
router.get('/analytics/screening', auth, rbac('admin'), async (req, res) => {
  try {
    const WATCH = 15;
    const HIGH = 25;
    // spinalDiscHerniation (Lumbar Disc Herniation) is deliberately ABSENT:
    // stored on import but excluded from every risk display per Dr Thung — ISN
    // cannot perform that assessment. Mirrors SHOWN_RISK_KEYS in
    // utils/cohorts.js (scoring) and the dashboards' RISK_KEYS (display).
    const INDICATORS = [
      { key: 'neckInjuryRisk', label: 'Neck' },
      { key: 'shoulderInjuryRisk', label: 'Shoulder' },
      { key: 'scoliosis', label: 'Scoliosis' },
      { key: 'lumbarPelvisInjury', label: 'Lumbar/Pelvis' },
      { key: 'jointPain', label: 'Joint Pain' },
      { key: 'kneeInjuryRisk', label: 'Knee' },
      { key: 'ankleInjuryRisk', label: 'Ankle' },
    ];
    const SCORES = ['overallActivityScore', 'injuryRiskIndex', 'mobility', 'stability', 'symmetry'];

    // Athlete-level filters (sport / programme / gender / age) so this picture
    // tracks the dashboard filters. The injury-only filters (body part, injury
    // type, date) don't apply — a screening isn't an injury.
    const { sport, program, gender, ageMin, ageMax } = req.query;
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    if (ageMin || ageMax) {
      where.age = {};
      if (ageMin) where.age[Op.gte] = Number(ageMin);
      if (ageMax) where.age[Op.lte] = Number(ageMax);
    }
    const rows = await Athlete.findAll({ where, raw: true });
    const screenedRows = rows.filter((r) => SCORES.some((k) => r[k] !== null && r[k] !== undefined));

    const indicators = INDICATORS.map(({ key, label }) => {
      let ok = 0, watch = 0, high = 0;
      screenedRows.forEach((r) => {
        const v = Number(r[key] ?? 0);
        if (v > HIGH) high++;
        else if (v > WATCH) watch++;
        else ok++;
      });
      return { key, label, ok, watch, high };
    });

    const averages = {};
    SCORES.forEach((k) => {
      const vals = screenedRows.map((r) => Number(r[k])).filter((v) => Number.isFinite(v));
      averages[k] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
    });

    // Muscle flags for the filtered athletes only, so the hotspots match the
    // rest of the card (an unscreened athlete has no flags either way).
    const flags = await MuscleFlag.findAll({ where: { athleteId: { [Op.in]: rows.map((r) => r.athleteId) } }, raw: true });
    const topMuscles = (type) => {
      const counts = new Map();
      flags.filter((f) => f.flagType === type).forEach((f) => {
        counts.set(f.muscle, (counts.get(f.muscle) ?? 0) + 1);
      });
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([muscle, count]) => ({ muscle, count }));
    };

    res.json({
      totalAthletes: rows.length,
      screened: screenedRows.length,
      unscreened: rows.length - screenedRows.length,
      averages,
      indicators,
      topMyodynamia: topMuscles('myodynamia'),
      topTension: topMuscles('tension'),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/:id — single athlete full detail (with muscle flags).
// requirePermission only constrains medical staff; athletes (own record),
// coaches (own sport) and admin pass through, with the ownership/sport-scope
// checks enforced below.
router.get('/:id', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    // Coach: screening detail is in remit, but only for their assigned sport —
    // same scope rule as the team/individual reports and screening history.
    if (req.user.role === 'coach' && athlete.sport !== req.user.coachSport) {
      return res.status(403).json({ message: 'Coaches can only view athletes in their assigned sport.' });
    }
    const out = serializeAthlete(athlete);
    out.screening = await latestIndicator(req.params.id);
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/athletes — create athlete (admin only)
router.post('/', auth, rbac('admin'), async (req, res) => {
  try {
    // Caller may submit nested `risks` { ... }; flatten to columns.
    const { risks, myodynamia, tension, disciplines, ...rest } = req.body;
    const payload = { ...rest, ...(risks || {}) };
    const athlete = await Athlete.create(payload);

    // Optional muscle-flag rows submitted alongside the athlete payload.
    if (Array.isArray(myodynamia)) {
      await MuscleFlag.bulkCreate(
        myodynamia.map((m) => ({ athleteId: athlete.athleteId, flagType: 'myodynamia', muscle: m.muscle, side: m.side }))
      );
    }
    if (Array.isArray(tension)) {
      await MuscleFlag.bulkCreate(
        tension.map((m) => ({ athleteId: athlete.athleteId, flagType: 'tension', muscle: m.muscle, side: m.side }))
      );
    }
    await syncDisciplines(athlete.athleteId, disciplines);

    const reloaded = await Athlete.findOne({
      where: { athleteId: athlete.athleteId },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    res.status(201).json(serializeAthlete(reloaded));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/athletes/:id — update athlete record (medical, admin)
router.patch('/:id', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { risks, myodynamia, tension, disciplines, ...rest } = req.body;
    const payload = { ...rest, ...(risks || {}) };
    // Check existence directly: Athlete.update returns affectedCount 0 for a
    // no-op column change (e.g. a disciplines- or flags-only PATCH), which must
    // not be mistaken for "not found".
    const exists = await Athlete.findOne({ where: { athleteId: req.params.id }, attributes: ['athleteId'], raw: true });
    if (!exists) return res.status(404).json({ message: 'Athlete not found' });
    if (Object.keys(payload).length > 0) await Athlete.update(payload, { where: { athleteId: req.params.id } });

    // Replace muscle-flag arrays if the caller sent new ones.
    if (Array.isArray(myodynamia)) {
      await MuscleFlag.destroy({ where: { athleteId: req.params.id, flagType: 'myodynamia' } });
      await MuscleFlag.bulkCreate(
        myodynamia.map((m) => ({ athleteId: req.params.id, flagType: 'myodynamia', muscle: m.muscle, side: m.side }))
      );
    }
    if (Array.isArray(tension)) {
      await MuscleFlag.destroy({ where: { athleteId: req.params.id, flagType: 'tension' } });
      await MuscleFlag.bulkCreate(
        tension.map((m) => ({ athleteId: req.params.id, flagType: 'tension', muscle: m.muscle, side: m.side }))
      );
    }
    // Only touch disciplines when the caller sent the field, so a partial PATCH
    // (e.g. just a risk edit) doesn't wipe an athlete's events.
    if (disciplines !== undefined) await syncDisciplines(req.params.id, disciplines);

    const reloaded = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    res.json(serializeAthlete(reloaded));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/athletes/:id — soft delete (admin only)
router.delete('/:id', auth, rbac('admin'), async (req, res) => {
  try {
    const [count] = await Athlete.update({ isActive: false }, { where: { athleteId: req.params.id } });
    if (!count) return res.status(404).json({ message: 'Athlete not found' });
    res.json({ message: 'Athlete deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
