// Coach role (experimental 4th role — NOT part of the locked 3-role model).
//
// A coach gets a READ-ONLY squad-readiness view of the athletes in their
// assigned sport(s). No clinical notes, no screening detail, no uploads.
// Readiness derives from each athlete's cohort-normed HoloMotion band — the
// same indicator the athlete and medical views report. (This route used to
// also aggregate a 28-day ACWR per athlete; that compute + payload were
// removed on 2026-07-16 when ACWR left the dashboards — the frontend no
// longer read it. See docs/fyp/ACWR_REBUILD.md.)
const express = require('express');
const { Op } = require('sequelize');
const { Athlete, Injury, MuscleFlag, Screening } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// GET /api/coach/readiness — squad-readiness rows for the coach's sports.
// (A former GET /me returning {name, sports} was removed 2026-07-17 — it had
// no caller; the readiness response already carries the coach's `sports`.)
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

    const [injuries, screenings] = await Promise.all([
      Injury.findAll({
        where: { athleteId: { [Op.in]: ids }, recoveryStatus: { [Op.ne]: 'Recovered' } },
        attributes: ['athleteId', 'recoveryStatus'],
        raw: true,
      }),
      Screening.findAll({
        where: { athleteId: { [Op.in]: ids } },
        order: [['assessedAt', 'DESC'], ['id', 'DESC']],
        attributes: ['athleteId', 'overallIndicator', 'overallBand', 'escalations', 'overrideBand'],
        raw: true,
      }),
    ]);
    // Latest screening indicator per athlete (the HoloMotion risk comparison).
    const indicatorByAthlete = new Map();
    for (const s of screenings) if (!indicatorByAthlete.has(s.athleteId)) {
      indicatorByAthlete.set(s.athleteId, {
        overallIndicator: s.overallIndicator,
        overallBand: s.overallBand,
        escalations: s.escalations,
        effectiveBand: s.overrideBand || s.overallBand,
      });
    }

    // Group injuries by athlete for O(1) lookup.
    const injuriesByAthlete = new Map();
    for (const i of injuries) {
      if (!injuriesByAthlete.has(i.athleteId)) injuriesByAthlete.set(i.athleteId, []);
      injuriesByAthlete.get(i.athleteId).push({ recoveryStatus: i.recoveryStatus });
    }

    const numOrZero = (v) => (v == null ? 0 : Number(v));
    const rows = athletes.map((a) => {
      const flags = a.muscleFlags || [];
      return {
        athleteId: a.athleteId,
        name: a.name,
        sport: a.sport,
        // 8 per-region exercise-risk indicators — drive the sport-aware
        // screening detail on the coach dashboard (lib/screeningAlerts.ts).
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
        // Headline screening scores (profile context on the coach board):
        overallActivityScore: a.overallActivityScore == null ? undefined : Number(a.overallActivityScore),
        injuryRiskIndex: a.injuryRiskIndex == null ? undefined : Number(a.injuryRiskIndex),
        mobility: a.mobility == null ? undefined : Number(a.mobility),
        stability: a.stability == null ? undefined : Number(a.stability),
        symmetry: a.symmetry == null ? undefined : Number(a.symmetry),
        myodynamia: flags.filter((f) => f.flagType === 'myodynamia').map(({ muscle, side }) => ({ muscle, side })),
        tension: flags.filter((f) => f.flagType === 'tension').map(({ muscle, side }) => ({ muscle, side })),
        activeInjuries: injuriesByAthlete.get(a.athleteId) || [],
        // HoloMotion overall risk indicator (cohort-normed), for squad comparison.
        screening: indicatorByAthlete.get(a.athleteId) || null,
      };
    });

    res.json({ sports, athletes: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
