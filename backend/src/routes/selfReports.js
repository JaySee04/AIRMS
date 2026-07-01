const express = require('express');
const { sequelize, SelfReport, Injury, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { serializeGeneric, serializeMany } = require('../utils/serialize');

const router = express.Router();

// GET /api/self-reports — all reports for review (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), requirePermission('reviewReports'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    const rows = await SelfReport.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/self-reports/mine — athlete's own submissions
router.get('/mine', auth, rbac('athlete'), async (req, res) => {
  try {
    const rows = await SelfReport.findAll({
      where: { athleteId: req.user.athleteId },
      order: [['createdAt', 'DESC']],
    });
    res.json(serializeMany(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/self-reports — submit a self-report (athlete only)
router.post('/', auth, rbac('athlete'), async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ where: { athleteId: req.user.athleteId } });
    const report = await SelfReport.create({
      ...req.body,
      athleteId: req.user.athleteId,
      athleteName: req.user.name,
      sport: athlete ? athlete.sport : null,
    });
    res.status(201).json(serializeGeneric(report));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/self-reports/:id/review — approve or reject (medical only)
// On Approval, atomically create an Injury record from the report payload.
// Wrapped in a transaction so the report status + the new Injury insert
// commit together — the relational integrity claim the panel cited.
router.patch('/:id/review', auth, rbac('medical'), requirePermission('reviewReports'), async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected' });
    }

    const report = await SelfReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    await sequelize.transaction(async (t) => {
      report.status = status;
      report.reviewNote = reviewNote;
      report.reviewedBy = req.user.name;
      report.reviewedAt = new Date();
      await report.save({ transaction: t });

      if (status === 'Approved') {
        await Injury.create({
          athleteId: report.athleteId,
          athleteName: report.athleteName,
          sport: report.sport,
          // Self-reports use free-form strings; the Injury enum is strict.
          // If the submission already matches a valid enum value it passes;
          // otherwise the route returns the underlying validation error.
          bodyPart: report.bodyPart,
          side: report.side,
          injuryType: report.injuryType || 'Other',
          severity: report.severity || 'Minor',
          date: report.createdAt,
          source: 'Athlete Self-Report',
          loggedBy: req.user.name,
          notes: report.description,
        }, { transaction: t });
      }
    });

    res.json(serializeGeneric(report));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
