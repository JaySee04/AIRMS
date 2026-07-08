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

// GET /api/injuries/athlete/:id — injuries for a specific athlete
router.get('/athlete/:id', auth, requirePermission('injuryReports'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
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
