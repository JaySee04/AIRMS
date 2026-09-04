const express = require('express');
const { recordAudit } = require('../utils/audit');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag, Screening, AthleteDiscipline } = require('../models');
const {
  screeningMovement, resolveCohortStats, latestScreeningsByAthlete,
} = require('../utils/cohorts');
const {
  belongsToCohort, resolvedCohortId, cohortLabelFor,
} = require('../utils/overallIndicator');
const { notifyInjuryToCoach } = require('../utils/notifications');
const { programmeActivityData } = require('../utils/programmeActivity');
const { aggregateSubitems } = require('../utils/subitemAggregate');
const { effectiveBand } = require('../utils/bands');
const { INDICATOR_ATTRS, toIndicator } = require('../utils/indicatorPayload');
const { getSettings } = require('../utils/settings');
const { sendError } = require('../utils/httpError');
const {
  focusBreakdown, isShownIndicator, SHOWN_INDICATORS, tally, bandOf,
} = require('../utils/cohortFocus');

// Headline columns that mark an athlete as "screened" — one of these present
// means a HoloMotion report has landed for them.
const SCREENED_SCORES = ['overallActivityScore', 'injuryRiskIndex', 'mobility', 'stability', 'symmetry'];
const isScreened = (r) => SCREENED_SCORES.some((k) => r[k] !== null && r[k] !== undefined);

// The whole screened institute, ignoring every population filter — the
// baseline a focused cohort is compared against ("is Badminton's knee problem
// worse than everyone's?"). Only queried when a region focus is active.
async function allScreenedRows() {
  const rows = await Athlete.findAll({ where: { isActive: true }, raw: true });
  return rows.filter(isScreened);
}

// Latest screening's overall indicator for ONE athlete, with the clinician
// override applied as the effective band. Returns null when no screening.
async function latestIndicator(athleteId) {
  const { rescreen_due_days: dueDays } = await getSettings();
  const s = await Screening.findOne({
    where: { athleteId },
    attributes: INDICATOR_ATTRS,
    order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  return toIndicator(s, dueDays);
}

// Many athletes in ONE query: one ordered fetch off the (athlete_id,
// assessed_at) index, keeping the first row per athlete. Per-athlete calls here
// cost a round trip per squad member. Same batching as routes/coach.js.
async function latestIndicatorsFor(athleteIds) {
  const byAthlete = new Map();
  if (!athleteIds.length) return byAthlete;
  const { rescreen_due_days: dueDays } = await getSettings();
  const rows = await Screening.findAll({
    where: { athleteId: { [Op.in]: athleteIds } },
    attributes: ['athleteId', ...INDICATOR_ATTRS],
    order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  for (const s of rows) {
    if (!byAthlete.has(s.athleteId)) byAthlete.set(s.athleteId, toIndicator(s, dueDays));
  }
  return byAthlete;
}

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { notFoundStatusFor } = require('../utils/permissions');
const { str, likeTerm, assertPlainQuery } = require('../utils/queryParams');
const { recomputeAll } = require('../utils/recompute');
const { serializeAthlete, serializeAthleteList } = require('../utils/serialize');
const { cleanDisciplineList } = require('../utils/disciplines');

const router = express.Router();

// Replace an athlete's discipline rows with a clean, de-duplicated set. A
// non-array (or omitted) value is treated as "no change" by callers; an empty
// array clears the athlete's events. Kept simple (destroy + bulkCreate) to
// mirror the muscle-flag replacement pattern used above.
async function syncDisciplines(athleteId, disciplines) {
  if (!Array.isArray(disciplines)) return;
  const clean = cleanDisciplineList(disciplines);
  await AthleteDiscipline.destroy({ where: { athleteId } });
  if (clean.length) {
    await AthleteDiscipline.bulkCreate(clean.map((discipline) => ({ athleteId, discipline })));
  }
}

router.get('/', auth, rbac('medical', 'admin', 'executive'), requirePermission('viewRecords'), async (req, res) => {
  try {
    // Shape-checked twice over, because the two platforms disagree: locally the
    // bracket becomes a nested value (caught by str), hosted it stays in the KEY
    // and the filter would be silently skipped (caught by assertPlainQuery).
    assertPlainQuery(req.query);
    const sport = str(req.query.sport, 'sport');
    const program = str(req.query.program, 'program');
    const gender = str(req.query.gender, 'gender');
    const discipline = str(req.query.discipline, 'discipline');
    const search = str(req.query.search, 'search');
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    // Name OR IC number — the clinician's stated way in is the IC ("they can
    // trace through their IC number", Dr Thung, 2026-04-24). The roster UIs
    // filter client-side and already match both; this keeps the API honest for
    // any caller that filters server-side instead.
    if (search) {
      // % and _ escaped: searching for "%" matched the entire roster, which
      // reads as a generous search rather than as a bug.
      const term = likeTerm(search);
      where[Op.or] = [
        { name: { [Op.like]: `%${term}%` } },
        { athleteId: { [Op.like]: `%${term}%` } },
      ];
    }
    // Discipline lives in a join table — resolve the matching athlete IDs first,
    // then filter the main query by them (keeps every athlete's full discipline
    // list intact for display, unlike a where on the include).
    if (discipline) {
      const owners = await AthleteDiscipline.findAll({ where: { discipline }, attributes: ['athleteId'], raw: true });
      const ids = owners.map((o) => o.athleteId);
      if (ids.length === 0) return res.json([]); // no athlete has this event
      where.athleteId = { [Op.in]: ids };
    }

    // List view omits muscle flags for payload size; disciplines are cheap and
    // drive the roster filters, so they're included (separate query, no join
    // row-multiplication).
    const rows = await Athlete.findAll({
      where,
      order: [['name', 'ASC']],
      include: [{ model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'], separate: true }],
    });
    res.json(serializeAthleteList(rows, req.user));
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

// GET /api/athletes/meta/sports — list of distinct sports (for filter dropdowns)
// Must be declared BEFORE /:id so Express doesn't match "meta" as an id.
router.get('/meta/sports', auth, rbac('medical', 'admin', 'executive'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const rows = await Athlete.findAll({
      attributes: ['sport'],
      group: ['sport'],
      order: [['sport', 'ASC']],
      raw: true,
    });
    res.json(rows.map((r) => r.sport).filter(Boolean));
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

// GET /api/athletes/meta/disciplines — distinct (sport, discipline) pairs already
// on record, so the import picker can offer "choose an existing event" as well
// as "type a new one". Declared BEFORE /:id. Scoped to active athletes.
router.get('/meta/disciplines', auth, rbac('medical', 'admin', 'executive'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const [discRows, athleteRows] = await Promise.all([
      AthleteDiscipline.findAll({ attributes: ['athleteId', 'discipline'], raw: true }),
      Athlete.findAll({ attributes: ['athleteId', 'sport'], where: { isActive: true }, raw: true }),
    ]);
    const sportBy = new Map(athleteRows.map((a) => [a.athleteId, a.sport]));
    const seen = new Set();
    const out = [];
    for (const r of discRows) {
      const sport = sportBy.get(r.athleteId);
      if (!sport || !r.discipline) continue;
      const key = `${sport}|${r.discipline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sport, discipline: r.discipline });
    }
    out.sort((a, b) => a.sport.localeCompare(b.sport) || a.discipline.localeCompare(b.discipline));
    res.json(out);
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

// GET /api/athletes/analytics/screening — cohort view of the ingested
// HoloMotion screening data (admin analytics). Declared BEFORE /:id.
// Returns, across active athletes:
//   - screened / unscreened counts (screened = any headline score present)
//   - per-indicator Low / Watch / Elevated counts (AIRMS bands: ≤15 / ≤25 />25).
//     The band WORDS live on the frontend (lib/screeningAlerts.ts BAND_LABEL) —
//     keep the boundaries here in step with that file and with the PDF reports
//     (routes/screeningReports.js RISK_ZONES). All three describe the same
//     numbers and must not contradict each other.
//   - cohort averages for the five headline gauges
//   - most-flagged muscles for each flag type
router.get('/analytics/screening', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    const WATCH = 15;
    const HIGH = 25;
    const SCORES = ['overallActivityScore', 'injuryRiskIndex', 'mobility', 'stability', 'symmetry'];

    // POPULATION filters — who is in the picture.
    const { sport, program, gender, ageMin, ageMax, discipline, region } = req.query;
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    if (ageMin || ageMax) {
      where.age = {};
      if (ageMin) where.age[Op.gte] = Number(ageMin);
      if (ageMax) where.age[Op.lte] = Number(ageMax);
    }
    if (discipline) {
      const owners = await AthleteDiscipline.findAll({ where: { discipline }, attributes: ['athleteId'], raw: true });
      where.athleteId = { [Op.in]: owners.map((o) => o.athleteId) };
    }
    const rows = await Athlete.findAll({ where, raw: true });
    const screenedRows = rows.filter((r) => SCORES.some((k) => r[k] !== null && r[k] !== undefined));

    const indicators = SHOWN_INDICATORS.map(({ key, label }) => {
      let ok = 0, watch = 0, high = 0;
      screenedRows.forEach((r) => {
        const v = Number(r[key] ?? 0);
        if (v > HIGH) high++;
        else if (v > WATCH) watch++;
        else ok++;
      });
      return { key, label, ok, watch, high };
    });

    const averages = {};
    SCORES.forEach((k) => {
      const vals = screenedRows.map((r) => Number(r[k])).filter((v) => Number.isFinite(v));
      averages[k] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
    });

    // Muscle flags for the filtered athletes only, so the hotspots match the
    // rest of the card (an unscreened athlete has no flags either way).
    const flags = await MuscleFlag.findAll({ where: { athleteId: { [Op.in]: rows.map((r) => r.athleteId) } }, raw: true });
    const topMuscles = (type) => {
      const counts = new Map();
      flags.filter((f) => f.flagType === type).forEach((f) => {
        counts.set(f.muscle, (counts.get(f.muscle) ?? 0) + 1);
      });
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([muscle, count]) => ({ muscle, count }));
    };

    // Screening trend (previous vs latest) from one fetch of this cohort's
    // screenings, aggregated by the pure utils/cohorts.screeningMovement.
    let trend = { comparable: 0, improving: 0, declining: 0, steady: 0, deltas: [], bandMoves: { better: 0, worse: 0 } };
    // Overall traffic-light band distribution across the cohort's latest
    // screenings (override wins). 'none' = scored but no band (small cohort).
    const bandDistribution = { green: 0, amber: 0, red: 0, none: 0 };
    let subitems = aggregateSubitems([]);
    let points = [];
    const ids = rows.map((r) => r.athleteId);
    if (ids.length) {
      const scr = await Screening.findAll({
        where: { athleteId: { [Op.in]: ids } },
        attributes: ['athleteId', 'assessedAt', 'id', 'totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand', 'subitems'],
        order: [['assessedAt', 'DESC'], ['id', 'DESC']],
        raw: true,
      });
      ({ trend } = screeningMovement(scr));
      const seenBand = new Set();
      const latestPerAthlete = [];
      for (const s of scr) {
        if (seenBand.has(s.athleteId)) continue;
        seenBand.add(s.athleteId);
        latestPerAthlete.push(s);
        const b = effectiveBand(s) || 'none';
        if (bandDistribution[b] !== undefined) bandDistribution[b]++; else bandDistribution.none++;
      }
      // The 25-cell subitem table, aggregated — the densest measurement the
      // instrument produces, and the only place it carries LEFT vs RIGHT. Built
      // from each athlete's LATEST screening, matching every other snapshot on
      // this page. See utils/subitemAggregate.js.
      subitems = aggregateSubitems(latestPerAthlete);
      // One point per athlete, for the shape-of-the-squad views (scatter,
      // distribution). Every other panel on this page is an AVERAGE, and an
      // average cannot show a squad splitting into two groups, or the one good
      // mover carrying a high risk score. 58 rows — small enough to send whole,
      // and the alternative (server-side binning) would fix the bucket edges the
      // client might want to move.
      const byId = new Map(rows.map((r) => [r.athleteId, r]));
      points = latestPerAthlete.map((sc) => {
        const a = byId.get(sc.athleteId) || {};
        return {
          athleteId: sc.athleteId,
          name: a.name || sc.athleteId,
          sport: a.sport || null,
          totalScore: sc.totalScore === null || sc.totalScore === undefined ? null : Number(sc.totalScore),
          exerciseRisks: sc.exerciseRisks === null || sc.exerciseRisks === undefined ? null : Number(sc.exerciseRisks),
          indicator: sc.overallIndicator === null || sc.overallIndicator === undefined ? null : Number(sc.overallIndicator),
          band: effectiveBand(sc),
        };
      });
    }

    res.json({
      totalAthletes: rows.length,
      screened: screenedRows.length,
      unscreened: rows.length - screenedRows.length,
      averages,
      indicators,
      topMyodynamia: topMuscles('myodynamia'),
      topTension: topMuscles('tension'),
      trend,
      bandDistribution,
      subitems,
      points,
      // REGION FOCUS — a lens, not a population filter. It does not remove any
      // athlete; it re-expresses the SAME cohort through one indicator, split
      // by every other dimension, so "which group carries this problem" is
      // answerable. Baseline is the whole institute, so a filtered cohort can
      // be read as better or worse than normal. See utils/cohortFocus.js.
      focus: region && isShownIndicator(region)
        ? focusBreakdown(screenedRows, region, await allScreenedRows())
        : null,
    });
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

// GET /api/athletes/analytics/periods — screening-programme activity over time.
// The administrator's own performance view: how many athletes were tested per
// year / quarter / month, whether population scores are rising or falling, and
// what happens between an athlete's own successive tests. Declared BEFORE /:id.
//
// Takes the same cohort slicers as /analytics/screening (sport / programme /
// gender / age) plus `discipline`, so a period comparison can be narrowed to
// the group actually under discussion — a whole-institution average moves for
// reasons that have nothing to do with any one squad.
//
// `from`/`to` bound the window (ISO dates). Aggregation runs over the immutable
// `screenings` history rather than the athletes table, so every test an athlete
// has ever had counts, not just their latest.
router.get('/analytics/periods', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    // Gathered by utils/programmeActivity.js, which the downloadable PDF also
    // uses — the page and the document must not be able to quote different KPIs.
    return res.json(await programmeActivityData(req.query));
  } catch (err) {
    return sendError(res, err, 'athletes.js');
  }
});

// GET /api/athletes/teammates — an athlete's own squad (same sport), SUMMARY
// only: name, programme, gender, and the overall risk band. Read-only, no peer
// clinical/screening detail — athletes see squad readiness, not each other's
// reports. Defined before /:id so "teammates" isn't captured as an id. (C3)
router.get('/teammates', auth, async (req, res) => {
  try {
    if (req.user.role !== 'athlete' || !req.user.athleteId) {
      return res.status(403).json({ message: 'Squad view is for athletes.' });
    }
    const me = await Athlete.findOne({ where: { athleteId: req.user.athleteId }, attributes: ['sport'], raw: true });
    if (!me || !me.sport) return res.status(404).json({ message: 'No sport on your athlete profile.' });
    const mates = await Athlete.findAll({
      where: { sport: me.sport, isActive: true },
      attributes: ['athleteId', 'name', 'program', 'gender'],
      order: [['name', 'ASC']],
      raw: true,
    });
    const indicators = await latestIndicatorsFor(mates.map((m) => m.athleteId));
    // A teammate's row carries NO athleteId. The athlete key IS the IC number
    // (A2), which encodes date of birth, birth state and sex — a system that
    // redacts the athlete's NAME on-device before a screening image may leave the
    // machine (§18) must not hand 16 NRICs to a browser to use as a React key.
    // `gender` goes for the plainer reason that nothing rendered it.
    const teammates = mates.map((m) => {
      const ind = indicators.get(m.athleteId);
      const isSelf = m.athleteId === req.user.athleteId;
      return {
        // Self only: the caller already knows their own IC, and the page marks
        // the row with it rather than trusting name equality.
        athleteId: isSelf ? m.athleteId : undefined,
        name: m.name,
        program: m.program,
        isSelf,
        overallIndicator: ind ? ind.overallIndicator : null,
        effectiveBand: ind ? ind.effectiveBand : null,
      };
    });
    // The caller's OWN cohort, which is not this squad and is the single most
    // misread thing on the page: the table is every athlete in the sport, while
    // the indicator beside each name is normed against a narrower group (sport +
    // programme + gender, often a handful of people). Without this an athlete
    // reads "3rd of 16" off a column that never ranked 16 of anybody. Self-scoped
    // and already on /athletes/:id — no disclosure this athlete did not have.
    const mine = indicators.get(req.user.athleteId) || null;
    res.json({
      sport: me.sport,
      you: mine ? {
        cohortLabel: mine.cohortLabel,
        cohortSize: mine.cohortSize,
        cohortRank: mine.cohortRank,
        overallIndicator: mine.overallIndicator,
      } : null,
      teammates,
    });
  } catch (err) { sendError(res, err, 'athletes.js'); }
});

// GET /api/athletes/:id — single athlete full detail (with muscle flags).
// requirePermission only constrains medical staff; athletes (own record),
// coaches (own sport) and admin pass through, with the ownership/sport-scope
// checks enforced below.
// GET /api/athletes/:id/sport-context — this athlete read against their OWN
// sport, for the clinician looking at them.
//
// Dr Thung, 2026-04-24: "the doctor in the room can also see, okay, this spot,
// what are the prominent kind of injury and when going to happen?" Answered from
// screening — which region is prominent across the sport, and whether THIS
// athlete is worse or better than their squad on it.
//
// Declared BEFORE /:id so Express doesn't swallow "sport-context" as an id.
router.get('/:id/sport-context', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const me = await Athlete.findOne({ where: { athleteId: req.params.id }, raw: true });
    if (!me) return res.status(404).json({ message: 'Athlete not found' });
    if (!me.sport) return res.json({ sport: null, n: 0, indicators: [] });

    const squad = (await Athlete.findAll({ where: { isActive: true, sport: me.sport }, raw: true }))
      .filter(isScreened);

    // Every shown indicator: how the sport sits on it, and where this athlete
    // falls. Ordered by what is most prominent IN THE SPORT, so the squad's
    // characteristic problem leads rather than this athlete's worst reading.
    const indicators = SHOWN_INDICATORS.map(({ key, label }) => {
      const t = tally(squad, key);
      const mine = me[key] === null || me[key] === undefined ? null : Number(me[key]);
      return {
        key,
        label,
        squadAvg: t.avg,
        squadN: t.n,
        elevated: t.high,
        watch: t.watch,
        elevatedShare: t.n ? +(t.high / t.n).toFixed(3) : null,
        value: mine,
        band: mine === null ? null : bandOf(mine),
        // Positive = worse than the squad on this indicator (risk is lower-better).
        vsSquad: mine === null || t.avg === null ? null : +(mine - t.avg).toFixed(1),
      };
    }).sort((a, b) => (b.elevatedShare ?? 0) - (a.elevatedShare ?? 0) || (b.squadAvg ?? 0) - (a.squadAvg ?? 0));

    return res.json({ sport: me.sport, n: squad.length, indicators });
  } catch (err) {
    return sendError(res, err, 'athletes.js');
  }
});

// Executive is deliberately absent from this allow-list.
//
// The role is defined as institutional oversight — the admin analytics and the
// three PDF reports — and a raw clinical record is neither. No executive screen
// calls this endpoint; the grant was reach nobody used.
//
// The capability is not actually lost, it is funnelled: an executive following a
// figure down to a named case pulls the individual report, which is the same
// clinical content and is AUDITED as `report.download`. Routing them through the
// logged path rather than the unlogged one is the point — oversight of the
// institution should itself be visible.
//
// `athlete` IS on this list, and must stay. The self-scope check lives inside
// the handler, and an rbac() list that omitted athlete would leave it correct
// and unreachable — which is exactly how isForeignAthleteRequest sat dead for
// weeks (§ Correct, and unreachable).
router.get('/:id', auth, rbac('athlete', 'medical', 'admin', 'coach'), requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    // 403 rather than 404 for a scoped role: the coach's sport check below runs
    // AFTER this lookup, so a plain 404 here would tell a coach which IC numbers
    // are on the roster. See notFoundStatusFor.
    if (!athlete) return res.status(notFoundStatusFor(req.user)).json({ message: 'Athlete not found' });
    // Coach: screening detail is in remit, but only for their assigned sport —
    // same scope rule as the team/individual reports and screening history.
    if (req.user.role === 'coach' && athlete.sport !== req.user.coachSport) {
      return res.status(403).json({ message: 'Coaches can only view athletes in their assigned sport.' });
    }
    const out = serializeAthlete(athlete, req.user);
    out.screening = await latestIndicator(req.params.id);

    // Per-cell peer context for the 25-subitem table.
    //
    // Built on JC's instruction (2026-08-23) over a stated objection, and the
    // objection shapes what this returns. A cohort here is 5-10 athletes, and a
    // standard deviation per CELL from that many observations is unstable
    // enough that banding a cell, or printing a z-score for it, would be
    // inventing precision the data cannot support — the §33c argument applies
    // with more force at cell level, not less.
    //
    // So this ships the group MEAN per cell and the number of peers behind it,
    // and nothing else. "Your torso ROM right is 64, the group averages 71" is
    // a description a physiologist can weigh for themselves. "Your torso ROM
    // right is Below Average (z = -1.4)" would be a claim, and at n=7 per cell
    // it would be the wrong one often enough to matter.
    if (out.screening && out.screening.subitems) {
      const settings = await getSettings();
      const cohort = await resolveCohortStats(athlete, {
        minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled,
      });
      if (cohort && cohort.tier) {
        // resolveCohortStats returns the STATS for the resolved tier, not its
        // identity; the id is derived from the athlete plus that tier, by the
        // same helper the scorer uses — so the peers averaged here are exactly
        // the peers the athlete was scored against.
        const cohortId = resolvedCohortId(athlete, cohort);
        const peers = (await latestScreeningsByAthlete())
          .filter((e) => belongsToCohort(e.athlete, cohortId))
          .map((e) => e.screening);
        const agg = aggregateSubitems(peers);
        out.subitemCohort = {
          label: cohortLabelFor(cohortId),
          tier: cohort.tier,
          n: peers.length,
          matrix: agg.matrix,
        };
      }
    }

    // Reading a clinical record is itself an act worth recording.
    //
    // The trail already logs report DOWNLOADS, for the stated reason that "for a
    // read-only role reading is the only auditable act" (§ Accountability). The
    // same argument applies with more force here: this endpoint returns a named
    // athlete's scores, subitem table, muscle flags and cohort standing, and
    // until now a clinician could open every record in the institute without
    // leaving a trace, while downloading one PDF left a permanent row.
    //
    // That gap is what makes the answer to "should medical staff be scoped by
    // sport?" defensible. The answer is accountability rather than restriction —
    // clinical cover is not organised by sport, and a clinician who cannot see a
    // history is a worse failure than a colleague who reads one they did not
    // need. But that argument only holds if the reading is visible, and it was
    // not.
    //
    // Written HERE, after every permission check, so a refused request logs
    // nothing — the same rule the download audit follows. An athlete opening
    // their OWN record is skipped: it is not an access anybody needs to review,
    // and logging it would bury the accesses that are.
    const isSelf = req.user.role === 'athlete' && req.user.athleteId === athlete.athleteId;
    if (!isSelf) {
      recordAudit(req, {
        action: 'athlete.view',
        entity: 'athlete',
        entityId: athlete.athleteId,
        summary: `Opened ${athlete.name || athlete.athleteId}'s screening record`,
        meta: { sport: athlete.sport || null },
      });
    }

    res.json(out);
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

router.post('/', auth, rbac('admin'), async (req, res) => {
  try {
    // Caller may submit nested `risks` { ... }; flatten to columns.
    const { risks, myodynamia, tension, disciplines, ...rest } = req.body;
    const payload = { ...rest, ...(risks || {}) };
    const athlete = await Athlete.create(payload);

    if (Array.isArray(myodynamia)) {
      await MuscleFlag.bulkCreate(
        myodynamia.map((m) => ({ athleteId: athlete.athleteId, flagType: 'myodynamia', muscle: m.muscle, side: m.side }))
      );
    }
    if (Array.isArray(tension)) {
      await MuscleFlag.bulkCreate(
        tension.map((m) => ({ athleteId: athlete.athleteId, flagType: 'tension', muscle: m.muscle, side: m.side }))
      );
    }
    await syncDisciplines(athlete.athleteId, disciplines);

    const reloaded = await Athlete.findOne({
      where: { athleteId: athlete.athleteId },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    res.status(201).json(serializeAthlete(reloaded, req.user));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { risks, myodynamia, tension, disciplines, ...rest } = req.body;
    const payload = { ...rest, ...(risks || {}) };
    // Check existence directly: Athlete.update returns affectedCount 0 for a
    // no-op column change (e.g. a disciplines- or flags-only PATCH), which must
    // not be mistaken for "not found".
    const exists = await Athlete.findOne({ where: { athleteId: req.params.id }, attributes: ['athleteId'], raw: true });
    if (!exists) return res.status(404).json({ message: 'Athlete not found' });
    if (Object.keys(payload).length > 0) await Athlete.update(payload, { where: { athleteId: req.params.id } });

    if (Array.isArray(myodynamia)) {
      await MuscleFlag.destroy({ where: { athleteId: req.params.id, flagType: 'myodynamia' } });
      await MuscleFlag.bulkCreate(
        myodynamia.map((m) => ({ athleteId: req.params.id, flagType: 'myodynamia', muscle: m.muscle, side: m.side }))
      );
    }
    if (Array.isArray(tension)) {
      await MuscleFlag.destroy({ where: { athleteId: req.params.id, flagType: 'tension' } });
      await MuscleFlag.bulkCreate(
        tension.map((m) => ({ athleteId: req.params.id, flagType: 'tension', muscle: m.muscle, side: m.side }))
      );
    }
    // Only touch disciplines when the caller sent the field, so a partial PATCH
    // (e.g. just a risk edit) doesn't wipe an athlete's events.
    if (disciplines !== undefined) await syncDisciplines(req.params.id, disciplines);

    const reloaded = await Athlete.findOne({
      where: { athleteId: req.params.id },
      include: [
        { model: MuscleFlag, as: 'muscleFlags' },
        { model: AthleteDiscipline, as: 'disciplines', attributes: ['discipline'] },
      ],
    });
    res.json(serializeAthlete(reloaded, req.user));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, rbac('admin'), async (req, res) => {
  try {
    const [count] = await Athlete.update({ isActive: false }, { where: { athleteId: req.params.id } });
    if (!count) return res.status(404).json({ message: 'Athlete not found' });
    res.json({ message: 'Athlete deactivated' });
  } catch (err) {
    sendError(res, err, 'athletes.js');
  }
});

// PATCH /api/athletes/:id/injury — medical/admin set an athlete's injury status
// (B4). SEPARATE from the risk band; an injured athlete is auto-excluded from
// cohort-norm CALCULATION — rebuilt immediately here, not deferred — but is
// still SCORED against the resulting norm. Note is optional; clearing injury clears the metadata.
router.patch('/:id/injury', auth, rbac('medical', 'admin'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const a = await Athlete.findByPk(req.params.id);
    if (!a) return res.status(404).json({ message: 'Athlete not found' });
    const injured = !!req.body.isInjured;
    await a.update({
      isInjured: injured,
      injuryNote: injured ? (String(req.body.note || '').trim() || null) : null,
      injuryBy: injured ? (req.user?.name || null) : null,
      injuryAt: injured ? new Date() : null,
    });
    // An injured athlete is excluded from norm CALCULATION, so the norm is
    // rebuilt HERE. Deferring it to the next recompute leaves the exclusion real
    // in the rules and invisible in the published norm.
    const { cohorts, indicators } = await recomputeAll();
    // Tell the sport's coach — the athlete is unavailable and the squad's norm
    // just moved. Fire-and-forget, same contract as the override notification:
    // a mail failure must not fail the clinical action.
    notifyInjuryToCoach(a, injured, a.injuryNote, req.user?.name);
    recordAudit(req, {
      action: 'athlete.injury',
      entity: 'athlete',
      entityId: a.athleteId,
      summary: `Marked ${a.name || a.athleteId} ${injured ? 'INJURED' : 'not injured'}`
        + (injured ? ' — excluded from norm calculation' : ''),
      meta: { isInjured: injured, note: a.injuryNote, cohorts, indicators },
    });
    res.json({
      athleteId: a.athleteId, isInjured: a.isInjured, injuryNote: a.injuryNote,
      injuryBy: a.injuryBy, injuryAt: a.injuryAt,
      recomputed: { cohorts, indicators },
    });
  } catch (err) { sendError(res, err, 'athletes.js'); }
});

module.exports = router;
