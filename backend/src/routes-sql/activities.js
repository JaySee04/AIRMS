const express = require('express');
const { Op } = require('sequelize');
const { Activity } = require('../models-sql');
const auth = require('../middleware/auth-sql');
const rbac = require('../middleware/rbac');
const { serializeGeneric, serializeMany } = require('../utils/serialize');

const router = express.Router();

// Rejects an activity date that lands after the current UTC day. Compared
// at day-boundary granularity (not instant-level), so a session logged
// "today" in any timezone still passes.
function isFutureDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  return d.getTime() > today.getTime();
}

// GET /api/activities/athlete/:id — activity log for an athlete
router.get('/athlete/:id', auth, async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { weeks } = req.query;
    const where = { athleteId: req.params.id };
    if (weeks) {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(weeks, 10) * 7);
      where.date = { [Op.gte]: since };
    }
    const rows = await Activity.findAll({ where, order: [['date', 'DESC']] });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/activities/athlete/:id/acwr — compute acute/chronic workload ratio
router.get('/athlete/:id/acwr', auth, async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const now = new Date();
    const fourWeeksAgo = new Date(now);
    fourWeeksAgo.setDate(now.getDate() - 28);

    const rows = await Activity.findAll({
      where: { athleteId: req.params.id, date: { [Op.gte]: fourWeeksAgo } },
      order: [['date', 'DESC']],
    });

    const weeklyLoads = [0, 0, 0, 0]; // index 0 = most recent week
    rows.forEach((a) => {
      const daysAgo = Math.floor((now - new Date(a.date)) / 86400000);
      const weekIdx = Math.floor(daysAgo / 7);
      if (weekIdx < 4) weeklyLoads[weekIdx] += a.load || 0;
    });

    const acute = weeklyLoads[0];
    const chronic = weeklyLoads.reduce((s, v) => s + v, 0) / 4;
    const acwr = chronic > 0 ? +(acute / chronic).toFixed(2) : 0;

    let riskLevel = 'low';
    if (acwr < 0.8 || acwr > 1.5) riskLevel = 'high';
    else if (acwr < 1.0 || acwr > 1.3) riskLevel = 'moderate';

    res.json({ acwr, acute, chronic, weeklyLoads, riskLevel });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/activities — log a training session (athlete only)
router.post('/', auth, rbac('athlete'), async (req, res) => {
  try {
    if (req.body?.date && isFutureDate(req.body.date)) {
      return res.status(400).json({ message: 'Activity date cannot be in the future' });
    }
    // load is auto-computed by the beforeValidate hook.
    const activity = await Activity.create({
      ...req.body,
      athleteId: req.user.athleteId,
    });
    res.status(201).json(serializeGeneric(activity));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/activities/:id — edit an activity (athlete only)
router.put('/:id', auth, rbac('athlete'), async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    if (activity.athleteId !== req.user.athleteId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { type, date, duration, intensity, notes } = req.body;
    if (date !== undefined && isFutureDate(date)) {
      return res.status(400).json({ message: 'Activity date cannot be in the future' });
    }
    if (type !== undefined) activity.type = type;
    if (date !== undefined) activity.date = date;
    if (duration !== undefined) activity.duration = duration;
    if (intensity !== undefined) activity.intensity = intensity;
    if (notes !== undefined) activity.notes = notes;
    await activity.save();
    res.json(serializeGeneric(activity));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/activities/:id — remove an activity (athlete, medical, admin)
router.delete('/:id', auth, rbac('athlete', 'medical', 'admin'), async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    if (req.user.role === 'athlete' && activity.athleteId !== req.user.athleteId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await activity.destroy();
    res.json({ message: 'Activity removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
