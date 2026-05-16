const express = require('express');
const Athlete = require('../models/Athlete');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// GET /api/athletes — list athletes (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const { sport, program, gender, search } = req.query;
    const filter = { isActive: true };
    if (sport) filter.sport = sport;
    if (program) filter.program = program;
    if (gender) filter.gender = gender;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const athletes = await Athlete.find(filter)
      .select('-myodynamia -tension') // omit heavy muscle arrays from list view
      .sort({ name: 1 });
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/:id — single athlete full detail
router.get('/:id', auth, async (req, res) => {
  try {
    // Athletes may only view their own profile
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({ athleteId: req.params.id });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/athletes — create athlete (admin only)
router.post('/', auth, rbac('admin'), async (req, res) => {
  try {
    const athlete = await Athlete.create(req.body);
    res.status(201).json(athlete);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/athletes/:id — update athlete record (medical, admin)
router.patch('/:id', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const athlete = await Athlete.findOneAndUpdate(
      { athleteId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    res.json(athlete);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/athletes/:id — soft delete (admin only)
router.delete('/:id', auth, rbac('admin'), async (req, res) => {
  try {
    const athlete = await Athlete.findOneAndUpdate(
      { athleteId: req.params.id },
      { isActive: false },
      { new: true }
    );
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    res.json({ message: 'Athlete deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/athletes/meta/sports — list of distinct sports (for filter dropdowns)
router.get('/meta/sports', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const sports = await Athlete.distinct('sport');
    res.json(sports.sort());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
