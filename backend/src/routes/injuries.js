const express = require('express');
const Injury = require('../models/Injury');
const Athlete = require('../models/Athlete');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// GET /api/injuries — filtered injury list (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const { athleteId, bodyPart, sport, program, gender, severity, startDate, endDate } = req.query;
    const filter = {};
    if (athleteId) filter.athleteId = athleteId;
    if (bodyPart) filter.bodyPart = bodyPart;
    if (sport) filter.sport = sport;
    if (program) filter.program = program;
    if (gender) filter.gender = gender;
    if (severity) filter.severity = severity;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    const injuries = await Injury.find(filter).sort({ date: -1 });
    res.json(injuries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/injuries/athlete/:id — injuries for a specific athlete
router.get('/athlete/:id', auth, async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const injuries = await Injury.find({ athleteId: req.params.id }).sort({ date: -1 });
    res.json(injuries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/injuries — log a new injury (medical, admin)
router.post('/', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    // Enrich with athlete metadata if not provided
    if (req.body.athleteId) {
      const athlete = await Athlete.findOne({ athleteId: req.body.athleteId });
      if (athlete) {
        if (!req.body.athleteName) req.body.athleteName = athlete.name;
        if (!req.body.sport)       req.body.sport       = athlete.sport;
        if (!req.body.gender)      req.body.gender      = athlete.gender;
        if (!req.body.program)     req.body.program     = athlete.program;
        if (req.body.athleteAge === undefined) req.body.athleteAge = athlete.age;
      }
    }
    const injury = await Injury.create({ ...req.body, loggedBy: req.user.name });
    res.status(201).json(injury);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/injuries/:id — update injury record (medical, admin)
router.patch('/:id', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const injury = await Injury.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!injury) return res.status(404).json({ message: 'Injury not found' });
    res.json(injury);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/injuries/analytics/summary — aggregated KPIs for admin dashboard
router.get('/analytics/summary', auth, rbac('admin'), async (req, res) => {
  try {
    const { sport, program, gender, bodyPart, injuryType, ageMin, ageMax, startDate, endDate } = req.query;
    const match = {};
    if (sport) match.sport = sport;
    if (program) match.program = program;
    if (gender) match.gender = gender;
    if (bodyPart) match.bodyPart = bodyPart;
    if (injuryType) match.injuryType = injuryType;
    if (ageMin || ageMax) {
      match.athleteAge = {};
      if (ageMin) match.athleteAge.$gte = Number(ageMin);
      if (ageMax) match.athleteAge.$lte = Number(ageMax);
    }
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const [total, byBodyPart, byType, bySeverity, byMonth] = await Promise.all([
      Injury.countDocuments(match),
      Injury.aggregate([{ $match: match }, { $group: { _id: '$bodyPart', count: { $sum: 1 } } }]),
      Injury.aggregate([{ $match: match }, { $group: { _id: '$injuryType', count: { $sum: 1 } } }]),
      Injury.aggregate([{ $match: match }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Injury.aggregate([
        { $match: match },
        { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const recovering = await Injury.countDocuments({ ...match, recoveryStatus: 'Recovering' });
    const athletesAffected = await Injury.distinct('athleteId', match);
    const sportsAffected = await Injury.distinct('sport', match);

    res.json({ total, recovering, athletesAffected: athletesAffected.length, sportsAffected: sportsAffected.length, byBodyPart, byType, bySeverity, byMonth });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
