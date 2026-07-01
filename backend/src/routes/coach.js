// Coach role (experimental 4th role — NOT part of the locked 3-role model).
//
// A coach gets a READ-ONLY squad-readiness view of the athletes in their
// assigned sport(s). No clinical notes, no screening detail, no uploads.
//
// Design note: the graded composite-risk logic (classifyCompositeRisk) stays
// in the frontend (lib/risk.ts) — the single source of truth. This route only
// does the heavy DB work: it scopes athletes by the coach's sports, aggregates
// each athlete's ACWR from their Activity loads, and bundles the profile +
// muscle flags + active-injury list the frontend needs to classify readiness.
const express = require('express');
const { Op } = require('sequelize');
const { Athlete, Activity, Injury, MuscleFlag } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

const DAY = 86400000;

// Acute = load over the last 7 days; chronic = average weekly load over the
// last 28 days (÷4). Mirrors the window the medical dashboard computes client
// side so the two views agree.
function computeAcwr(loads, now) {
  let acute = 0;
  let chronic28 = 0;
  for (const { date, load } of loads) {
    const daysAgo = (now - new Date(date).getTime()) / DAY;
    if (daysAgo < 0) continue;
    if (daysAgo < 7) acute += load;
    if (daysAgo < 28) chronic28 += load;
  }
  const chronic = chronic28 / 4;
  return chronic > 0 ? +(acute / chronic).toFixed(2) : 0;
}

// GET /api/coach/me — the signed-in coach's assigned sports (for the UI header).
router.get('/me', auth, rbac('coach'), (req, res) => {
  const sports = Array.isArray(req.user.coachSports) ? req.user.coachSports : [];
  res.json({ name: req.user.name, sports });
});

// GET /api/coach/readiness — squad-readiness rows for the coach's sports.
router.get('/readiness', auth, rbac('coach'), async (req, res) => {
  try {
    const sports = Array.isArray(req.user.coachSports) ? req.user.coachSports : [];
    if (sports.length === 0) return res.json({ sports: [], athletes: [] });

    const athletes = await Athlete.findAll({
      where: { sport: { [Op.in]: sports }, isActive: true },
      include: [{ model: MuscleFlag, as: 'muscleFlags', attributes: ['flagType', 'muscle', 'side'] }],
      order: [['name', 'ASC']],
    });
    const ids = athletes.map((a) => a.athleteId);
    if (ids.length === 0) return res.json({ sports, athletes: [] });

    const since = new Date(Date.now() - 28 * DAY);
    const [activities, injuries] = await Promise.all([
      Activity.findAll({
        where: { athleteId: { [Op.in]: ids }, date: { [Op.gte]: since } },
        attributes: ['athleteId', 'date', 'load'],
        raw: true,
      }),
      Injury.findAll({
        where: { athleteId: { [Op.in]: ids }, recoveryStatus: { [Op.ne]: 'Recovered' } },
        attributes: ['athleteId', 'recoveryStatus'],
        raw: true,
      }),
    ]);

    // Group activities + injuries by athlete for O(1) lookup.
    const loadsByAthlete = new Map();
    for (const a of activities) {
      if (!loadsByAthlete.has(a.athleteId)) loadsByAthlete.set(a.athleteId, []);
      loadsByAthlete.get(a.athleteId).push({ date: a.date, load: Number(a.load) || 0 });
    }
    const injuriesByAthlete = new Map();
    for (const i of injuries) {
      if (!injuriesByAthlete.has(i.athleteId)) injuriesByAthlete.set(i.athleteId, []);
      injuriesByAthlete.get(i.athleteId).push({ recoveryStatus: i.recoveryStatus });
    }

    const numOrZero = (v) => (v == null ? 0 : Number(v));
    const now = Date.now();
    const rows = athletes.map((a) => {
      const flags = a.muscleFlags || [];
      return {
        athleteId: a.athleteId,
        name: a.name,
        sport: a.sport,
        acwr: computeAcwr(loadsByAthlete.get(a.athleteId) || [], now),
        // 8 per-region exercise-risk indicators — drive the sport-aware
        // screening alerts on the coach dashboard (lib/screeningAlerts.ts).
        risks: {
          neckInjuryRisk: numOrZero(a.neckInjuryRisk),
          shoulderInjuryRisk: numOrZero(a.shoulderInjuryRisk),
          scoliosis: numOrZero(a.scoliosis),
          spinalDiscHerniation: numOrZero(a.spinalDiscHerniation),
          lumbarPelvisInjury: numOrZero(a.lumbarPelvisInjury),
          jointPain: numOrZero(a.jointPain),
          kneeInjuryRisk: numOrZero(a.kneeInjuryRisk),
          ankleInjuryRisk: numOrZero(a.ankleInjuryRisk),
        },
        // Fields consumed by classifyCompositeRisk on the frontend:
        overallActivityScore: a.overallActivityScore == null ? undefined : Number(a.overallActivityScore),
        injuryRiskIndex: a.injuryRiskIndex == null ? undefined : Number(a.injuryRiskIndex),
        mobility: a.mobility == null ? undefined : Number(a.mobility),
        stability: a.stability == null ? undefined : Number(a.stability),
        symmetry: a.symmetry == null ? undefined : Number(a.symmetry),
        myodynamia: flags.filter((f) => f.flagType === 'myodynamia').map(({ muscle, side }) => ({ muscle, side })),
        tension: flags.filter((f) => f.flagType === 'tension').map(({ muscle, side }) => ({ muscle, side })),
        activeInjuries: injuriesByAthlete.get(a.athleteId) || [],
      };
    });

    res.json({ sports, athletes: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
