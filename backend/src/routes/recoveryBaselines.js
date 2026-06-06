const express = require('express');
const { Op } = require('sequelize');
const { RecoveryBaseline } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { serializeGeneric, serializeMany } = require('../utils/serialize');

const router = express.Router();

// GET /api/recovery-baselines/athlete/:id — all baselines for an athlete.
// Pass ?active=1 to fetch only the open (unresolved) baseline. Athletes
// can read their own; medical+admin can read anyone's.
router.get('/athlete/:id', auth, async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const where = { athleteId: req.params.id };
    if (req.query.active === '1' || req.query.active === 'true') {
      where.resolvedAt = { [Op.is]: null };
    }
    const rows = await RecoveryBaseline.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/recovery-baselines — open a new baseline. Idempotent against an
// already-active baseline: returns the existing one rather than creating
// a duplicate. This lets the frontend fire the trigger naively on every
// dashboard load without worrying about double-creates.
router.post('/', auth, async (req, res) => {
  try {
    const {
      athleteId,
      snapshotAcwr,
      chronicLoad,
      targetLowMin,
      targetLowMax,
      triggerCls,
      triggerLevel,
      factors,
    } = req.body;

    if (req.user.role === 'athlete' && req.user.athleteId !== athleteId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const existing = await RecoveryBaseline.findOne({
      where: { athleteId, resolvedAt: { [Op.is]: null } },
    });
    if (existing) return res.json(serializeGeneric(existing));

    const baseline = await RecoveryBaseline.create({
      athleteId,
      snapshotAcwr,
      chronicLoad,
      targetLowMin,
      targetLowMax,
      triggerCls,
      triggerLevel,
      factors: Array.isArray(factors) ? factors.join(', ') : (factors || null),
    });
    res.status(201).json(serializeGeneric(baseline));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/recovery-baselines/athlete/:id/resolve — closes the currently
// active baseline for an athlete (sets resolvedAt). No-op if none active.
router.patch('/athlete/:id/resolve', auth, async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const active = await RecoveryBaseline.findOne({
      where: { athleteId: req.params.id, resolvedAt: { [Op.is]: null } },
    });
    if (!active) return res.json({ message: 'No active baseline' });
    active.resolvedAt = new Date();
    await active.save();
    res.json(serializeGeneric(active));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/recovery-baselines/:id — medical/admin only; remove a stale
// or mistakenly-created baseline.
router.delete('/:id', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const row = await RecoveryBaseline.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Baseline not found' });
    await row.destroy();
    res.json({ message: 'Baseline removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
