const express = require('express');
const SelfReport = require('../models/SelfReport');
const Injury = require('../models/Injury');
const Athlete = require('../models/Athlete');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// GET /api/self-reports — all reports for review (medical, admin)
router.get('/', auth, rbac('medical', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const reports = await SelfReport.find(filter).sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/self-reports/mine — athlete's own submissions
router.get('/mine', auth, rbac('athlete'), async (req, res) => {
  try {
    const reports = await SelfReport.find({ athleteId: req.user.athleteId }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/self-reports — submit a self-report (athlete only)
router.post('/', auth, rbac('athlete'), async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ athleteId: req.user.athleteId });
    const report = await SelfReport.create({
      ...req.body,
      athleteId: req.user.athleteId,
      athleteName: req.user.name,
      sport: athlete?.sport,
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/self-reports/:id/review — approve or reject (medical only)
router.patch('/:id/review', auth, rbac('medical'), async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected' });
    }

    const report = await SelfReport.findByIdAndUpdate(
      req.params.id,
      { status, reviewNote, reviewedBy: req.user.name, reviewedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });

    // Promote approved self-reports into the official injury log
    if (status === 'Approved') {
      await Injury.create({
        athleteId: report.athleteId,
        athleteName: report.athleteName,
        sport: report.sport,
        bodyPart: report.bodyPart,
        side: report.side,
        injuryType: report.injuryType,
        severity: report.severity,
        date: report.createdAt,
        source: 'Athlete Self-Report',
        loggedBy: req.user.name,
        notes: report.description,
      });
    }

    res.json(report);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
