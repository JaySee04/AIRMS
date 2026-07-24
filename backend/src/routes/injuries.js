const express = require('express');
const { Op, fn, col, literal } = require('sequelize');
const { Injury, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { serializeGeneric, serializeMany } = require('../utils/serialize');

const router = express.Router();

function buildWhere(q) {
  const where = {};
  if (q.athleteId) where.athleteId = q.athleteId;
  if (q.bodyPart) where.bodyPart = q.bodyPart;
  if (q.sport) where.sport = q.sport;
  if (q.program) where.program = q.program;
  if (q.gender) where.gender = q.gender;
  if (q.injuryType) where.injuryType = q.injuryType;
  if (q.severity) where.severity = q.severity;
  if (q.ageMin || q.ageMax) {
    where.athleteAge = {};
    if (q.ageMin) where.athleteAge[Op.gte] = Number(q.ageMin);
    if (q.ageMax) where.athleteAge[Op.lte] = Number(q.ageMax);
  }
  if (q.startDate || q.endDate) {
    where.date = {};
    if (q.startDate) where.date[Op.gte] = new Date(q.startDate);
    if (q.endDate) where.date[Op.lte] = new Date(q.endDate);
  }
  return where;
}

// GET /api/injuries — filtered injury list (medical, admin).
// Optional ?limit=N caps the payload for callers that only render the
// newest few rows (e.g. the injury-log "recent entries" card).
router.get('/', auth, rbac('medical', 'admin'), requirePermission('injuryReports'), async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 0);
    const rows = await Injury.findAll({
      where,
      order: [['date', 'DESC']],
      ...(limit > 0 ? { limit } : {}),
    });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/injuries/analytics/summary — aggregated KPIs for admin dashboard
// Must be declared BEFORE /athlete/:id and other dynamic routes so Express
// matches `analytics/summary` before treating "analytics" as an id segment.
router.get('/analytics/summary', auth, rbac('admin', 'medical'), requirePermission('injuryReports'), async (req, res) => {
  try {
    const where = buildWhere(req.query);

    // One aggregation per axis plus a couple of scalars. Each Sequelize call
    // returns [{ _id, count }, ...] (the `_id` alias is the GROUP BY value),
    // which is exactly the envelope the admin dashboard reads.
    const groupBy = (field, opts = {}) =>
      Injury.findAll({
        where,
        attributes: [[col(field), '_id'], [fn('COUNT', col('id')), 'count']],
        group: [col(field)],
        order: opts.sortByCount ? [[literal('count'), 'DESC']] : undefined,
        raw: true,
      });

    const [total, byBodyPart, byType, bySeverity, bySport, byGender, byProgram] = await Promise.all([
      Injury.count({ where }),
      groupBy('body_part'),
      groupBy('injury_type'),
      groupBy('severity'),
      groupBy('sport', { sortByCount: true }),
      groupBy('gender'),
      groupBy('program'),
    ]);

    // Monthly aggregation via YEAR()/MONTH(). Returned as
    // { _id: { year, month }, count } so the chart can render directly.
    const monthRows = await Injury.findAll({
      where,
      attributes: [
        [fn('YEAR', col('date')), 'year'],
        [fn('MONTH', col('date')), 'month'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [fn('YEAR', col('date')), fn('MONTH', col('date'))],
      order: [
        [fn('YEAR', col('date')), 'ASC'],
        [fn('MONTH', col('date')), 'ASC'],
      ],
      raw: true,
    });
    const byMonth = monthRows.map((r) => ({
      _id: { year: Number(r.year), month: Number(r.month) },
      count: Number(r.count),
    }));

    const recovering = await Injury.count({ where: { ...where, recoveryStatus: 'Recovering' } });
    const athletesAffected = await Injury.aggregate('athleteId', 'COUNT', { where, distinct: true });
    const sportsAffected = await Injury.aggregate('sport', 'COUNT', { where, distinct: true });

    // Normalise count to Number (mysql2 returns BIGINT as string).
    const normalise = (rows) => rows.map((r) => ({ _id: r._id, count: Number(r.count) }));

    res.json({
      total,
      recovering,
      athletesAffected,
      sportsAffected,
      byBodyPart: normalise(byBodyPart),
      byType: normalise(byType),
      bySeverity: normalise(bySeverity),
      bySport: normalise(bySport),
      byGender: normalise(byGender),
      byProgram: normalise(byProgram),
      byMonth,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/injuries/analytics/trends — recovery + recurrence + same-sport
// clustering for the admin "Recovery & Trends" report. Declared BEFORE
// /athlete/:id. Accepts the same filters as the summary (sport, dates, etc.).
router.get('/analytics/trends', auth, rbac('admin'), requirePermission('injuryReports'), async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const injuries = await Injury.findAll({ where, raw: true });
    const total = injuries.length;

    const statusCount = { Recovered: 0, Recovering: 0, Chronic: 0 };
    injuries.forEach((i) => { if (statusCount[i.recoveryStatus] !== undefined) statusCount[i.recoveryStatus] += 1; });
    const recurrentInjuries = injuries.filter((i) => i.mechanism === 'Recurrent').length;

    // Per-athlete rollup: who's fully recovered, who's still carrying something,
    // and who has a recurring problem (2+ injuries in the same body part).
    const byAthlete = new Map();
    injuries.forEach((i) => {
      if (!i.athleteId) return;
      if (!byAthlete.has(i.athleteId)) {
        byAthlete.set(i.athleteId, { athleteId: i.athleteId, name: i.athleteName || i.athleteId, sport: i.sport || '—', list: [] });
      }
      byAthlete.get(i.athleteId).list.push(i);
    });
    let fullyRecovered = 0;
    let stillAffected = 0;
    let chronicAthletes = 0;
    const recurringAthletes = [];
    for (const a of byAthlete.values()) {
      const active = a.list.some((i) => i.recoveryStatus !== 'Recovered');
      if (active) stillAffected += 1; else fullyRecovered += 1;
      if (a.list.some((i) => i.recoveryStatus === 'Chronic')) chronicAthletes += 1;
      const bp = {};
      a.list.forEach((i) => { bp[i.bodyPart] = (bp[i.bodyPart] || 0) + 1; });
      const repeats = Object.entries(bp).filter(([, c]) => c >= 2).map(([bodyPart, c]) => ({ bodyPart, count: c }));
      if (repeats.length) {
        recurringAthletes.push({
          athleteId: a.athleteId, name: a.name, sport: a.sport,
          repeats: repeats.sort((x, y) => y.count - x.count),
          totalCases: a.list.length,
        });
      }
    }
    recurringAthletes.sort((x, y) => (y.repeats[0].count - x.repeats[0].count) || (y.totalCases - x.totalCases));

    // Same-sport clustering — how many injuries + distinct athletes per sport.
    const sportMap = new Map();
    injuries.forEach((i) => {
      const s = i.sport || '—';
      if (!sportMap.has(s)) sportMap.set(s, { sport: s, injuries: 0, athletes: new Set(), active: 0 });
      const e = sportMap.get(s);
      e.injuries += 1;
      if (i.athleteId) e.athletes.add(i.athleteId);
      if (i.recoveryStatus !== 'Recovered') e.active += 1;
    });
    const bySport = [...sportMap.values()]
      .map((e) => ({ sport: e.sport, injuries: e.injuries, athletes: e.athletes.size, active: e.active }))
      .sort((a, b) => b.injuries - a.injuries);

    res.json({
      total,
      athletesAffected: byAthlete.size,
      statusCount,
      recoveryRate: total ? Math.round((statusCount.Recovered / total) * 100) : 0,
      fullyRecovered,
      stillAffected,
      chronicAthletes,
      recurrentInjuries,
      recurringAthletes: recurringAthletes.slice(0, 25),
      bySport,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/injuries/athlete/:id — injuries for a specific athlete
router.get('/athlete/:id', auth, requirePermission('injuryReports'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Clinical injury records are outside the coach remit — coaches get
    // active-injury counts via /coach/readiness, not per-injury notes.
    if (req.user.role === 'coach') {
      return res.status(403).json({ message: 'Coaches do not have access to injury records.' });
    }
    const rows = await Injury.findAll({
      where: { athleteId: req.params.id },
      order: [['date', 'DESC']],
    });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/injuries — log a new injury (medical, admin)
router.post('/', auth, rbac('medical', 'admin'), requirePermission('injuryReports'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.athleteId) {
      const athlete = await Athlete.findOne({ where: { athleteId: payload.athleteId } });
      if (athlete) {
        if (!payload.athleteName) payload.athleteName = athlete.name;
        if (!payload.sport)       payload.sport       = athlete.sport;
        if (!payload.gender)      payload.gender      = athlete.gender;
        if (!payload.program)     payload.program     = athlete.program;
        if (payload.athleteAge === undefined) payload.athleteAge = athlete.age;
      }
    }
    const injury = await Injury.create({ ...payload, loggedBy: req.user.name });
    res.status(201).json(serializeGeneric(injury));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/injuries/:id — update injury record (medical, admin)
router.patch('/:id', auth, rbac('medical', 'admin'), requirePermission('injuryReports'), async (req, res) => {
  try {
    const injury = await Injury.findByPk(req.params.id);
    if (!injury) return res.status(404).json({ message: 'Injury not found' });
    await injury.update(req.body);
    res.json(serializeGeneric(injury));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
