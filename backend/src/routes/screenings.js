// Screening history + clinician override (redesign spec §3.4, §5).
const express = require('express');
const { Screening, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { notifyOverrideToCoach } = require('../utils/notifications');

const router = express.Router();

// GET /api/screenings/athlete/:id — full history (newest first). Athletes may
// read their own; coaches athletes in their assigned sport; medical/admin any
// (medical gated by viewRecords).
router.get('/athlete/:id', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user.role === 'coach') {
      const athlete = await Athlete.findOne({ where: { athleteId: req.params.id }, attributes: ['sport'], raw: true });
      if (!athlete || athlete.sport !== req.user.coachSport) {
        return res.status(403).json({ message: 'Coaches can only view screening history for athletes in their assigned sport.' });
      }
    }
    // Summary columns only — the heavy per-report detail (subitems, posture,
    // summary text) stays on the latest-screening fetch and the PDF.
    const rows = await Screening.findAll({
      where: { athleteId: req.params.id },
      attributes: [
        'id', 'assessedAt', 'importedBy',
        'totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks',
        'overallIndicator', 'overallBand', 'overrideBand', 'overrideBy',
      ],
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/screenings/:id/full — ONE screening reshaped into the athlete-dashboard
// shape (flat scores + risks{} + muscle arrays + the indicator sub-object), so any
// role can render a PAST screening's dashboard, not only the latest. Muscle flags
// come from the row's JSON snapshot (history), not the live muscle_flags table.
// Same access control as the history list: athlete self, coach sport-scoped,
// medical/admin any (viewRecords).
router.get('/:id/full', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    const s = await Screening.findByPk(req.params.id, { raw: true });
    if (!s) return res.status(404).json({ message: 'Screening not found' });
    if (req.user.role === 'athlete' && req.user.athleteId !== s.athleteId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({
      where: { athleteId: s.athleteId },
      attributes: ['athleteId', 'name', 'sport', 'age', 'gender'],
      raw: true,
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    if (req.user.role === 'coach' && athlete.sport !== req.user.coachSport) {
      return res.status(403).json({ message: 'Coaches can only view athletes in their assigned sport.' });
    }

    const num = (v) => (v == null ? 0 : Number(v));
    const flags = s.muscleFlags || {};
    res.json({
      ...athlete,
      overallActivityScore: num(s.totalScore),
      injuryRiskIndex: num(s.exerciseRisks),
      mobility: num(s.rom),
      stability: num(s.stability),
      symmetry: num(s.symmetry),
      risks: {
        neckInjuryRisk: num(s.neckInjuryRisk),
        shoulderInjuryRisk: num(s.shoulderInjuryRisk),
        scoliosis: num(s.scoliosis),
        spinalDiscHerniation: num(s.spinalDiscHerniation),
        lumbarPelvisInjury: num(s.lumbarPelvisInjury),
        jointPain: num(s.jointPain),
        kneeInjuryRisk: num(s.kneeInjuryRisk),
        ankleInjuryRisk: num(s.ankleInjuryRisk),
      },
      myodynamia: Array.isArray(flags.myodynamia) ? flags.myodynamia.map(({ muscle, side }) => ({ muscle, side })) : [],
      tension: Array.isArray(flags.tension) ? flags.tension.map(({ muscle, side }) => ({ muscle, side })) : [],
      screening: {
        screeningId: s.id,
        assessedAt: s.assessedAt,
        overallIndicator: s.overallIndicator,
        overallBand: s.overallBand,
        escalations: s.escalations,
        factors: Array.isArray(s.factors) ? s.factors : [],
        subitems: s.subitems || null,
        overrideBand: s.overrideBand,
        overrideNote: s.overrideNote,
        overrideBy: s.overrideBy,
        overrideAt: s.overrideAt,
        effectiveBand: s.overrideBand || s.overallBand,
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/screenings/:id/override — clinician sets the effective band after a
// real assessment (e.g. an amber athlete checked and cleared to green). A note
// is required. The override auto-expires when a newer screening is imported
// (new row, no override). Medical staff only.
router.patch('/:id/override', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { band, note } = req.body || {};
    const row = await Screening.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Screening not found' });
    if (band && !['green', 'amber', 'red'].includes(band)) {
      return res.status(400).json({ message: 'band must be green, amber, or red' });
    }
    if (band && !String(note || '').trim()) {
      return res.status(400).json({ message: 'A note is required when overriding the risk band.' });
    }
    if (band) {
      await row.update({ overrideBand: band, overrideNote: String(note).trim(), overrideBy: req.user?.name || null, overrideAt: new Date() });
      // Tell the athlete's coach an escalation was set by medical (fire-and-
      // forget; only amber/red notify — notifyOverrideToCoach gates on that).
      const athlete = await Athlete.findOne({ where: { athleteId: row.athleteId }, attributes: ['name', 'sport'], raw: true });
      if (athlete) notifyOverrideToCoach(athlete, band, String(note).trim(), req.user?.name);
    } else {
      await row.update({ overrideBand: null, overrideNote: null, overrideBy: null, overrideAt: null });
    }
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
