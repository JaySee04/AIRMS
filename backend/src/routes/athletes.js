const express = require('express');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag } = require('../models');
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
    res.json(serializeAthlete(athlete));
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
