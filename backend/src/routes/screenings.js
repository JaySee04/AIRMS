// Screening history + clinician override (redesign spec §3.4, §5).
const express = require('express');
const { recordAudit } = require('../utils/audit');
const { getSettings } = require('../utils/settings');
const { sequelize, Screening, Athlete, MuscleFlag } = require('../models');
const auth = require('../middleware/auth');
const { reliability } = require('../utils/reliability');
const { PERIOD_SCORES } = require('../utils/periodScores');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { notifyOverrideToCoach } = require('../utils/notifications');
const { queuePostImport } = require('../utils/postImport');
const { effectiveBand } = require('../utils/bands');
const { toIndicator } = require('../utils/indicatorPayload');

const router = express.Router();

// GET /api/screenings/athlete/:id — full history (newest first). Athletes may
// read their own; coaches athletes in their assigned sport; medical/admin any
// (medical gated by viewRecords).
// GET /api/screenings/reliability — the programme's detectable-change
// thresholds, per score.
//
// Its own endpoint rather than a field on the history response: it is a fact
// about the PROGRAMME, not an athlete. The same numbers govern the athlete's
// sparklines, the coach's arrows and the institution's change chart, and
// computing it per athlete would invite them to disagree.
//
// Open to any authenticated user — it carries no athlete data, just six
// thresholds and how they were arrived at, and an athlete needs it to know
// whether a movement in their own line means anything.
//
// The answer is usually "we cannot tell yet": below MIN_PAIRS each score
// declines to the documented fallback, and `sufficient` says which happened.
router.get('/reliability', auth, async (_req, res) => {
  try {
    const rows = await Screening.findAll({
      attributes: ['id', 'athleteId', 'assessedAt', ...PERIOD_SCORES.map(([k]) => k)],
      raw: true,
    });
    const rel = reliability(rows);
    res.json({
      scores: rel.scores.map((x) => ({
        key: x.key,
        label: x.label,
        higherBetter: x.higherBetter,
        pairs: x.pairs,
        deadBand: x.deadBand,
        sufficient: x.sufficient,
        reason: x.reason,
      })),
      minPairs: rel.minPairs,
      fallback: rel.fallback,
      anySufficient: rel.anySufficient,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
      screening: toIndicator(s, (await getSettings()).rescreen_due_days),
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
    recordAudit(req, {
      action: 'screening.override',
      entity: 'screening',
      entityId: row.id,
      summary: band
        ? `Overrode ${row.athleteId}'s band to ${band.toUpperCase()}`
        : `Cleared the band override on ${row.athleteId}`,
      meta: { band: band || null, note: band ? String(note).trim() : null, computed: row.overallBand },
    });
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/screenings/:id/reinstate — make an EARLIER screening the athlete's
// current one again.
//
// The athletes table holds only the LATEST import; the screenings table holds
// every one. So a mis-attached import — the operator picked the wrong athlete,
// or a bad extraction was committed — permanently overwrote the flat columns
// with no way back, even though the good snapshot was still sitting in history.
// This copies a chosen snapshot back over the flat columns and muscle flags.
//
// Nothing is deleted and nothing is rewritten: the screenings table is append
// only and is not touched here. That makes the operation inherently reversible —
// to undo a reinstatement you reinstate the row you came from, which is still
// there. It changes which snapshot is CURRENT, not what the history says.
router.post('/:id/reinstate', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const row = await Screening.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Screening not found' });

    const athlete = await Athlete.findOne({ where: { athleteId: row.athleteId } });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });

    // The newest screening by date, used only to word the audit entry.
    //
    // Deliberately NOT used to reject "you are already current". The flat
    // columns and the newest row are not the same thing — after any reinstate
    // they are precisely NOT — so refusing the newest row would make the undo
    // impossible: having gone back to an older screening you could never return
    // to the latest. Reinstating something already current is a harmless no-op.
    const latest = await Screening.findOne({
      where: { athleteId: row.athleteId },
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    });

    // Screening column → the flat Athlete column it feeds. Named explicitly
    // because the two differ (totalScore/overallActivityScore, rom/mobility)
    // and a silent mismatch would put the wrong number on a dashboard.
    const FLAT = {
      totalScore: 'overallActivityScore',
      exerciseRisks: 'injuryRiskIndex',
      rom: 'mobility',
      stability: 'stability',
      symmetry: 'symmetry',
      neckInjuryRisk: 'neckInjuryRisk',
      shoulderInjuryRisk: 'shoulderInjuryRisk',
      scoliosis: 'scoliosis',
      spinalDiscHerniation: 'spinalDiscHerniation',
      lumbarPelvisInjury: 'lumbarPelvisInjury',
      jointPain: 'jointPain',
      kneeInjuryRisk: 'kneeInjuryRisk',
      ankleInjuryRisk: 'ankleInjuryRisk',
    };
    const patch = {};
    for (const [from, to] of Object.entries(FLAT)) {
      if (row[from] !== null && row[from] !== undefined) patch[to] = row[from];
    }

    // Muscle flags travel with the snapshot, so they have to move too — leaving
    // the newer set behind would show one screening's scores beside another's
    // flags, which is worse than either alone.
    //
    // But an ABSENT snapshot is not an EMPTY one. Rows written before flags were
    // snapshotted (and the seeded trend history) carry no muscleFlags at all;
    // treating that as "this report found nothing" silently deletes every flag
    // the athlete has. When the snapshot is missing we restore the scores and
    // leave the flags alone, and say so in the response.
    const snap = row.muscleFlags && typeof row.muscleFlags === 'object' ? row.muscleFlags : null;
    const hasFlagSnapshot = !!snap && (Array.isArray(snap.myodynamia) || Array.isArray(snap.tension));
    const flagRows = !hasFlagSnapshot ? [] : [
      ...(Array.isArray(snap.myodynamia) ? snap.myodynamia : []).map((m) => ({ ...m, flagType: 'myodynamia' })),
      ...(Array.isArray(snap.tension) ? snap.tension : []).map((m) => ({ ...m, flagType: 'tension' })),
    ]
      .filter((m) => m && m.muscle && ['L', 'R', 'B'].includes(m.side))
      .map((m) => ({
        athleteId: row.athleteId, flagType: m.flagType, muscle: String(m.muscle).trim(), side: m.side,
      }));

    await sequelize.transaction(async (t) => {
      await Athlete.update(patch, { where: { athleteId: row.athleteId }, transaction: t });
      if (hasFlagSnapshot) {
        await MuscleFlag.destroy({ where: { athleteId: row.athleteId }, transaction: t });
        if (flagRows.length) await MuscleFlag.bulkCreate(flagRows, { transaction: t });
      }
    });

    // Same rescore path an import takes — the cohort indicator is derived from
    // the flat columns, so it is stale until this runs.
    queuePostImport(row.athleteId);

    recordAudit(req, {
      action: 'screening.reinstate',
      entity: 'screening',
      entityId: row.id,
      summary: `Reinstated ${athlete.name || row.athleteId}'s screening of `
        + `${row.assessedAt ? new Date(row.assessedAt).toISOString().slice(0, 10) : 'unknown date'}`
        + ` as current${latest ? `, replacing ${latest.assessedAt ? new Date(latest.assessedAt).toISOString().slice(0, 10) : 'the newest'}` : ''}`,
      meta: {
        reinstatedScreeningId: row.id,
        replacedScreeningId: latest ? latest.id : null,
        muscleFlags: hasFlagSnapshot ? flagRows.length : 'kept (snapshot had none recorded)',
      },
    });

    res.json({
      message: 'Reinstated',
      athleteId: row.athleteId,
      screeningId: row.id,
      muscleFlags: flagRows.length,
      // Tells the UI (and the operator) that this older row predates flag
      // snapshotting, so the flags on screen still belong to a later report.
      muscleFlagsRestored: hasFlagSnapshot,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
