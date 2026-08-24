// Coach role — a first-class 4th role (FYP II), read-only.
//
// A READ-ONLY squad-readiness view of the athletes in their assigned sport(s),
// plus screening detail, the individual screening PDF and history for those same
// athletes — enforced by sport-scope checks in routes/athletes.js, screenings.js
// and screeningReports.js. No clinical notes, no injury records, no uploads.
// Readiness derives from the cohort-normed HoloMotion band, the same indicator
// the athlete and medical views report.
const express = require('express');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag, Screening, AthleteDiscipline } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { INDICATOR_ATTRS, toIndicator } = require('../utils/indicatorPayload');
const { getSettings } = require('../utils/settings');
const { effectiveBand } = require('../utils/bands');
const { reliability } = require('../utils/reliability');

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

    const screenings = await Screening.findAll({
      where: { athleteId: { [Op.in]: ids } },
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
      attributes: ['athleteId', ...INDICATOR_ATTRS],
      raw: true,
    });
    // Latest screening indicator per athlete (the HoloMotion risk comparison),
    // plus the previous one's indicator so the dashboard can show a trend arrow.
    // Screenings are ordered newest-first, so per athlete the 1st row is latest,
    // the 2nd is previous.
    const { rescreen_due_days: dueDays } = await getSettings();
    const indicatorByAthlete = new Map();
    const seen = new Map();
    for (const s of screenings) {
      const n = seen.get(s.athleteId) || 0;
      if (n === 0) {
        // One shared shaper (utils/indicatorPayload.js), so this payload cannot
        // drift from the clinician override the coach's override card promises.
        indicatorByAthlete.set(s.athleteId, {
          ...toIndicator(s, dueDays),
          prevIndicator: null,
          prevAssessedAt: null,
        });
      } else if (n === 1) {
        const cur = indicatorByAthlete.get(s.athleteId);
        if (cur) { cur.prevIndicator = s.overallIndicator; cur.prevAssessedAt = s.assessedAt; }
      }
      seen.set(s.athleteId, n + 1);
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
        // HoloMotion overall risk indicator (cohort-normed), for squad comparison.
        screening: indicatorByAthlete.get(a.athleteId) || null,
      };
    });

    // The threshold at which the coach's trend arrows call a move real.
    //
    // Derived here rather than hardcoded, and over the WHOLE roster rather than
    // this sport, for the reason the rescreen recall is: a coach's view must be a
    // SLICE of the institution's judgement, never a second opinion. A literal 2
    // agrees with the institution only by accident — the day ISN records its
    // twentieth repeat pair MDC95 becomes a real number, the admin change chart
    // follows it, and a hardcoded arrow would keep answering "did this change"
    // differently on the coach's screen. `deadBandFor` is always usable so the
    // client never branches; `sufficient` says whether it was earned or assumed,
    // per score — the indicator can decline while another qualifies, and it is
    // the indicator the arrows judge.
    const allIndicators = await Screening.findAll({
      attributes: ['id', 'athleteId', 'assessedAt', 'overallIndicator'],
      raw: true,
    });
    const rel = reliability(allIndicators);
    res.json({
      sport,
      athletes: rows,
      deadBand: rel.deadBandFor('overallIndicator'),
      deadBandDerived: Boolean(rel.byKey.overallIndicator?.sufficient),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
