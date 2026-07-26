// Coach role — a first-class 4th role (FYP II, promoted 2026-07-19; read-only).
//
// A coach gets a READ-ONLY squad-readiness view of the athletes in their
// assigned sport(s), plus read-only screening detail (and, since 2026-07-23,
// the individual screening PDF + history) for those same athletes — enforced
// by sport-scope checks in routes/athletes.js, screenings.js and
// screeningReports.js. No clinical notes, no injury records, no uploads.
// Readiness derives from each athlete's cohort-normed HoloMotion band — the
// same indicator the athlete and medical views report. (This route used to
// also aggregate a 28-day ACWR per athlete; that compute + payload were
// removed on 2026-07-16 when ACWR left the dashboards — the frontend no
// longer read it. See docs/fyp/ACWR_REBUILD.md.)
const express = require('express');
const { Op } = require('sequelize');
const { Athlete, Injury, MuscleFlag, Screening, AthleteDiscipline } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// GET /api/coach/readiness — squad-readiness rows for the coach's one sport.
// (A former GET /me returning {name, sports} was removed 2026-07-17 — it had
// no caller; the readiness response already carries the coach's `sport`.)
router.get('/readiness', auth, rbac('coach'), async (req, res) => {
  try {
    const sport = req.user.coachSport || null;
    if (!sport) return res.json({ sport: null, athletes: [] });

    const athletes = await Athlete.findAll({
      where: { sport, isActive: true },
      include: [
        { model: MuscleFlag, as: 'muscleFlags', attributes: ['flagType', 'muscle', 'side'] },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
      order: [['name', 'ASC']],
    });
    const ids = athletes.map((a) => a.athleteId);
    if (ids.length === 0) return res.json({ sport, athletes: [] });

    const [injuries, screenings] = await Promise.all([
      Injury.findAll({
        where: { athleteId: { [Op.in]: ids }, recoveryStatus: { [Op.ne]: 'Recovered' } },
        attributes: ['athleteId', 'recoveryStatus'],
        raw: true,
      }),
      Screening.findAll({
        where: { athleteId: { [Op.in]: ids } },
        order: [['assessedAt', 'DESC'], ['id', 'DESC']],
        attributes: ['athleteId', 'assessedAt', 'overallIndicator', 'overallBand', 'escalations', 'factors', 'subitems', 'posture', 'overrideBand', 'overrideNote', 'overrideBy'],
        raw: true,
      }),
    ]);
    // Latest screening indicator per athlete (the HoloMotion risk comparison),
    // plus the previous one's indicator so the dashboard can show a trend arrow.
    // Screenings are ordered newest-first, so per athlete the 1st row is latest,
    // the 2nd is previous.
    const indicatorByAthlete = new Map();
    const seen = new Map();
    for (const s of screenings) {
      const n = seen.get(s.athleteId) || 0;
      if (n === 0) {
        indicatorByAthlete.set(s.athleteId, {
          overallIndicator: s.overallIndicator,
          overallBand: s.overallBand,
          escalations: s.escalations,
          factors: Array.isArray(s.factors) ? s.factors : [],
          subitems: s.subitems || null,
          posture: s.posture || null,
          // Carry the clinician override through so the coach's OverallRiskBadge
          // shows "set by clinician" + the note, not the generic band message —
          // the override card promises the coach sees this. (athletes.js already
          // ships these; the coach payload was dropping them.)
          overrideBand: s.overrideBand,
          overrideNote: s.overrideNote,
          overrideBy: s.overrideBy,
          effectiveBand: s.overrideBand || s.overallBand,
          prevIndicator: null,
          prevAssessedAt: null,
        });
      } else if (n === 1) {
        const cur = indicatorByAthlete.get(s.athleteId);
        if (cur) { cur.prevIndicator = s.overallIndicator; cur.prevAssessedAt = s.assessedAt; }
      }
      seen.set(s.athleteId, n + 1);
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
        program: a.program,
        gender: a.gender ?? null,
        age: a.age ?? null,
        // Events this athlete competes in (e.g. badminton Men's Doubles).
        disciplines: (a.disciplines || []).map((d) => d.discipline),
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

    res.json({ sport, athletes: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
