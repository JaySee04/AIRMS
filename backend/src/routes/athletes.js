const express = require('express');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag, Screening } = require('../models');

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

const router = express.Router();

// GET /api/athletes — list athletes (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { sport, program, gender, search } = req.query;
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    if (search) where.name = { [Op.like]: `%${search}%` };

    // List view omits muscle flags for payload size; detail view includes them.
    const rows = await Athlete.findAll({
      where,
      order: [['name', 'ASC']],
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

// GET /api/athletes/analytics/screening — cohort view of the ingested
// HoloMotion screening data (admin analytics). Declared BEFORE /:id.
// Returns, across active athletes:
//   - screened / unscreened counts (screened = any headline score present)
//   - per-indicator OK / Watch / High counts (report bands: ≤15 / ≤25 / >25)
//   - cohort averages for the five headline gauges
//   - most-flagged muscles for each flag type
router.get('/analytics/screening', auth, rbac('admin'), async (_req, res) => {
  try {
    const WATCH = 15;
    const HIGH = 25;
    const INDICATORS = [
      { key: 'neckInjuryRisk', label: 'Neck' },
      { key: 'shoulderInjuryRisk', label: 'Shoulder' },
      { key: 'scoliosis', label: 'Scoliosis' },
      { key: 'spinalDiscHerniation', label: 'Spinal Disc' },
      { key: 'lumbarPelvisInjury', label: 'Lumbar/Pelvis' },
      { key: 'jointPain', label: 'Joint Pain' },
      { key: 'kneeInjuryRisk', label: 'Knee' },
      { key: 'ankleInjuryRisk', label: 'Ankle' },
    ];
    const SCORES = ['overallActivityScore', 'injuryRiskIndex', 'mobility', 'stability', 'symmetry'];

    const rows = await Athlete.findAll({ where: { isActive: true }, raw: true });
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

    const flags = await MuscleFlag.findAll({ raw: true });
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
// requirePermission only constrains medical staff; athletes (own record) and
// admin pass through, with the athlete ownership check enforced below.
router.get('/:id', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [{ model: MuscleFlag, as: 'muscleFlags' }],
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
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
    const { risks, myodynamia, tension, ...rest } = req.body;
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

    const reloaded = await Athlete.findOne({
      where: { athleteId: athlete.athleteId },
      include: [{ model: MuscleFlag, as: 'muscleFlags' }],
    });
    res.status(201).json(serializeAthlete(reloaded));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/athletes/:id — update athlete record (medical, admin)
router.patch('/:id', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { risks, myodynamia, tension, ...rest } = req.body;
    const payload = { ...rest, ...(risks || {}) };
    const [count] = await Athlete.update(payload, { where: { athleteId: req.params.id } });
    if (!count) return res.status(404).json({ message: 'Athlete not found' });

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

    const reloaded = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [{ model: MuscleFlag, as: 'muscleFlags' }],
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
