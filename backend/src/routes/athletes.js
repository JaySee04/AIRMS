const express = require('express');
const { Op } = require('sequelize');
const { Athlete, MuscleFlag, Screening, AthleteDiscipline } = require('../models');
const { screeningMovement } = require('../utils/cohorts');
const { screeningPeriods, GRAINS } = require('../utils/screeningPeriods');
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

// Only the columns the indicator payload needs — keeps the big JSON/TEXT
// columns (muscle_flags, summary_text) and the 12 raw scores out of the row.
const INDICATOR_ATTRS = [
  'id', 'assessedAt', 'overallIndicator', 'overallBand', 'escalations', 'factors',
  'subitems', 'overrideBand', 'overrideNote', 'overrideBy', 'overrideAt',
];

// Shape one Screening row into the indicator payload the dashboards read.
function toIndicator(s) {
  if (!s) return null;
  return {
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
    // The band clinicians/coaches act on: an override wins until the next import.
    effectiveBand: s.overrideBand || s.overallBand,
  };
}

// Latest screening's overall indicator for ONE athlete, with the clinician
// override applied as the effective band. Returns null when no screening.
async function latestIndicator(athleteId) {
  const s = await Screening.findOne({
    where: { athleteId },
    attributes: INDICATOR_ATTRS,
    order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  return toIndicator(s);
}

// Many athletes in ONE query: one ordered fetch off the (athlete_id,
// assessed_at) index, keeping the first row per athlete. Per-athlete calls here
// cost a round trip per squad member. Same batching as routes/coach.js.
async function latestIndicatorsFor(athleteIds) {
  const byAthlete = new Map();
  if (!athleteIds.length) return byAthlete;
  const rows = await Screening.findAll({
    where: { athleteId: { [Op.in]: athleteIds } },
    attributes: ['athleteId', ...INDICATOR_ATTRS],
    order: [['assessedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  for (const s of rows) {
    if (!byAthlete.has(s.athleteId)) byAthlete.set(s.athleteId, toIndicator(s));
  }
  return byAthlete;
}

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
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
    const { sport, program, gender, discipline, search } = req.query;
    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    // Name OR IC number — the clinician's stated way in is the IC ("they can
    // trace through their IC number", Dr Thung, 2026-04-24). The roster UIs
    // filter client-side and already match both; this keeps the API honest for
    // any caller that filters server-side instead.
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { athleteId: { [Op.like]: `%${search}%` } },
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
    res.json(serializeAthleteList(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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
    // spinalDiscHerniation (Lumbar Disc Herniation) is deliberately ABSENT:
    // stored on import but excluded from every risk display per Dr Thung — ISN
    // cannot perform that assessment. Mirrors SHOWN_RISK_KEYS in
    // utils/cohorts.js (scoring) and the dashboards' RISK_KEYS (display).
    const INDICATORS = [
      { key: 'neckInjuryRisk', label: 'Neck' },
      { key: 'shoulderInjuryRisk', label: 'Shoulder' },
      { key: 'scoliosis', label: 'Scoliosis' },
      { key: 'lumbarPelvisInjury', label: 'Lumbar/Pelvis' },
      { key: 'jointPain', label: 'Joint Pain' },
      { key: 'kneeInjuryRisk', label: 'Knee' },
      { key: 'ankleInjuryRisk', label: 'Ankle' },
    ];
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

    const indicators = INDICATORS.map(({ key, label }) => {
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
    const ids = rows.map((r) => r.athleteId);
    if (ids.length) {
      const scr = await Screening.findAll({
        where: { athleteId: { [Op.in]: ids } },
        attributes: ['athleteId', 'assessedAt', 'id', 'totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand'],
        order: [['assessedAt', 'DESC'], ['id', 'DESC']],
        raw: true,
      });
      ({ trend } = screeningMovement(scr));
      const seenBand = new Set();
      for (const s of scr) {
        if (seenBand.has(s.athleteId)) continue;
        seenBand.add(s.athleteId);
        const b = s.overrideBand || s.overallBand || 'none';
        if (bandDistribution[b] !== undefined) bandDistribution[b]++; else bandDistribution.none++;
      }
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
    res.status(500).json({ message: err.message });
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
    const {
      grain = 'quarter', sport, program, gender, discipline, ageMin, ageMax, from, to,
    } = req.query;
    if (!GRAINS.includes(String(grain))) {
      return res.status(400).json({ message: `grain must be one of: ${GRAINS.join(', ')}` });
    }

    const where = { isActive: true };
    if (sport) where.sport = sport;
    if (program) where.program = program;
    if (gender) where.gender = gender;
    if (ageMin || ageMax) {
      where.age = {};
      if (ageMin) where.age[Op.gte] = Number(ageMin);
      if (ageMax) where.age[Op.lte] = Number(ageMax);
    }

    // Discipline is a separate table, so narrow the roster by a subquery on the
    // athletes who compete in it rather than joining every screening row.
    if (discipline) {
      const inDiscipline = await AthleteDiscipline.findAll({
        where: { discipline }, attributes: ['athleteId'], raw: true,
      });
      where.athleteId = { [Op.in]: inDiscipline.map((d) => d.athleteId) };
    }

    const roster = await Athlete.findAll({ where, attributes: ['athleteId'], raw: true });
    const ids = roster.map((r) => r.athleteId);

    const empty = {
      grain, periods: [], betweenTests: null,
      coverage: { rostered: roster.length, tested: 0, untested: roster.length, tests: 0 },
    };
    if (!ids.length) return res.json(empty);

    const scrWhere = { athleteId: { [Op.in]: ids } };
    if (from || to) {
      scrWhere.assessedAt = {};
      if (from) scrWhere.assessedAt[Op.gte] = new Date(from);
      if (to) scrWhere.assessedAt[Op.lte] = new Date(to);
    }
    const rows = await Screening.findAll({
      where: scrWhere,
      attributes: [
        'id', 'athleteId', 'assessedAt', 'totalScore', 'rom', 'stability', 'symmetry',
        'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand',
      ],
      order: [['assessedAt', 'ASC'], ['id', 'ASC']],
      raw: true,
    });

    const result = screeningPeriods(rows, { grain });
    const tested = new Set(rows.map((r) => r.athleteId)).size;
    return res.json({
      ...result,
      // Coverage is the roster measured against the WINDOW, so a narrow
      // from/to correctly shows athletes as untested in that window.
      coverage: {
        rostered: roster.length,
        tested,
        untested: Math.max(0, roster.length - tested),
        tests: rows.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
    const teammates = mates.map((m) => {
      const ind = indicators.get(m.athleteId);
      return {
        athleteId: m.athleteId,
        name: m.name,
        program: m.program,
        gender: m.gender,
        isSelf: m.athleteId === req.user.athleteId,
        overallIndicator: ind ? ind.overallIndicator : null,
        effectiveBand: ind ? ind.effectiveBand : null,
      };
    });
    res.json({ sport: me.sport, teammates });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/athletes/:id — single athlete full detail (with muscle flags).
// requirePermission only constrains medical staff; athletes (own record),
// coaches (own sport) and admin pass through, with the ownership/sport-scope
// checks enforced below.
// GET /api/athletes/:id/sport-context — this athlete read against their OWN
// sport, for the clinician looking at them.
//
// Dr Thung, 2026-04-24 (13:00): "the doctor in the room can also see, okay, this
// spot, what are the prominent kind of injury and when going to happen? So you
// can also give them a good advice." The medical view used to answer that from
// the injury log; that went with the HoloMotion-only cut, so it is answered from
// screening instead — which region is prominent across the sport, and whether
// THIS athlete is worse or better than their squad on it.
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
    return res.status(500).json({ message: err.message });
  }
});

router.get('/:id', auth, requirePermission('viewRecords'), async (req, res) => {
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
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    // Coach: screening detail is in remit, but only for their assigned sport —
    // same scope rule as the team/individual reports and screening history.
    if (req.user.role === 'coach' && athlete.sport !== req.user.coachSport) {
      return res.status(403).json({ message: 'Coaches can only view athletes in their assigned sport.' });
    }
    const out = serializeAthlete(athlete);
    out.screening = await latestIndicator(req.params.id);
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(201).json(serializeAthlete(reloaded));
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
    res.json(serializeAthlete(reloaded));
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
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/athletes/:id/injury — medical/admin set an athlete's injury status
// (B4). SEPARATE from the risk band; an injured athlete is auto-excluded from
// cohort-norm CALCULATION (applied on the next recompute) but still scored
// against the norm. Note is optional; clearing injury clears the metadata.
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
    res.json({ athleteId: a.athleteId, isInjured: a.isInjured, injuryNote: a.injuryNote, injuryBy: a.injuryBy, injuryAt: a.injuryAt });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
