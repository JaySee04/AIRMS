// Programme Activity — the administrator's own performance view, gathered once.
//
// How many athletes were tested per period, which way population scores moved,
// what happens between an athlete's own successive tests, and how far the roster
// has been covered.
//
// Extracted from routes/athletes.js when the same figures had to appear in a
// downloadable PDF. Two code paths computing "the programme's KPIs" would be free
// to disagree, and the report is precisely the artefact someone files or signs
// off — the page and the document must not be able to quote different numbers.

const { Op } = require('sequelize');
const { Screening, Athlete, AthleteDiscipline } = require('../models');
const { screeningPeriods, median, GRAINS } = require('./screeningPeriods');
const { getSettings } = require('./settings');
const { recallState } = require('./recall');
const { str, date } = require('./queryParams');

// The scope filters, as a sentence — for the PDF cover and the page's own note,
// so a printed copy says who it is about.
function scopeLabel(query = {}) {
  const parts = [];
  if (query.sport) parts.push(String(query.sport));
  if (query.program) parts.push(String(query.program));
  if (query.gender) parts.push(String(query.gender));
  if (query.discipline) parts.push(String(query.discipline));
  if (query.ageMin || query.ageMax) parts.push(`age ${query.ageMin || '0'}-${query.ageMax || '+'}`);
  if (query.from || query.to) parts.push(`${query.from ? `from ${query.from}` : ''}${query.to ? ` to ${query.to}` : ''}`.trim());
  return parts.length ? parts.join(' · ') : 'Whole institute, all time';
}

// Who is due to be screened again.
//
// Deliberately measured against EVERY screening an athlete has, not the ones
// inside the report's from/to window: "when were you last seen" is a fact about
// the athlete, and narrowing it to a window would report someone as never
// screened because the reader happened to be looking at last quarter.
//
// Three states, and `never` is kept apart from `overdue` on purpose. An athlete
// who has never been screened is a gap in the roster, not a lapsed recall — the
// action is to book a first assessment, and they have no baseline to compare
// anything against either.
//
// Each row carries the athlete's NAME and SPORT as well as the identifier
// (2026-09-04, JC). Counts alone tell an administrator that six athletes have
// never been screened; they do not tell anybody who to call, which is the only
// thing that turns the figure into an action. The identifier on its own does not
// help either — it is the IC number, which nobody reads as a person.
async function rescreenRecall(roster, allRows = null) {
  const { rescreen_due_days: dueDays } = await getSettings();
  const ids = roster.map((r) => r.athleteId);
  if (!ids.length) {
    return { dueDays, current: 0, dueSoon: 0, overdue: 0, never: 0, medianAgeDays: null, athletes: [] };
  }

  // The caller already holds every screening for this roster whenever the report
  // is unwindowed, which is the common case — reuse it rather than paying for a
  // second full scan of the same rows. A windowed caller passes nothing, because
  // its rows are a subset and recall must see all of them.
  const all = allRows || await Screening.findAll({
    where: { athleteId: { [Op.in]: ids } },
    attributes: ['athleteId', 'assessedAt'],
    raw: true,
  });
  const latest = new Map();
  for (const s of all) {
    const t = new Date(s.assessedAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (!latest.has(s.athleteId) || t > latest.get(s.athleteId)) latest.set(s.athleteId, t);
  }

  const now = Date.now();
  const athletes = [];
  let current = 0; let dueSoon = 0; let overdue = 0; let never = 0;
  const ages = [];

  for (const r of roster) {
    const t = latest.get(r.athleteId);
    if (t === undefined) {
      never += 1;
      athletes.push({
        athleteId: r.athleteId, name: r.name || null, sport: r.sport || null,
        lastScreened: null, ageDays: null, status: 'never',
      });
      continue;
    }
    const ageDays = Math.floor((now - t) / 86400000);
    ages.push(ageDays);
    const status = recallState(ageDays, dueDays);
    if (status === 'overdue') overdue += 1;
    else if (status === 'due-soon') dueSoon += 1;
    else current += 1;
    athletes.push({
      athleteId: r.athleteId, name: r.name || null, sport: r.sport || null,
      lastScreened: new Date(t).toISOString(), ageDays, status,
    });
  }

  const medianAgeDays = median(ages);

  return {
    dueDays,
    current,
    dueSoon,
    overdue,
    never,
    medianAgeDays,
    // Worst first: the point of the list is the call-back queue.
    athletes: athletes.sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity)),
  };
}

async function programmeActivityData(query = {}) {
  const {
    grain = 'quarter', sport, program, gender, discipline, ageMin, ageMax, from, to,
  } = query;
  // Every filter is a single value or absent; `?sport[]=x` is a malformed
  // request, not an undocumented multi-select.
  for (const [k, v] of Object.entries({ sport, program, gender, discipline })) str(v, k);
  if (!GRAINS.includes(String(grain))) {
    const err = new Error(`grain must be one of: ${GRAINS.join(', ')}`);
    err.status = 400;
    throw err;
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

  // name and sport as well as the key: rescreenRecall puts them on every row so
  // the recall list names people rather than identifiers. Selecting only
  // athleteId here would leave those fields quietly null on every row.
  const roster = await Athlete.findAll({
    where, attributes: ['athleteId', 'name', 'sport'], raw: true,
  });
  const ids = roster.map((r) => r.athleteId);
  const scope = scopeLabel(query);

  if (!ids.length) {
    return {
      grain,
      periods: [],
      betweenTests: null,
      seasonality: null,
      coverage: {
        rostered: roster.length, tested: 0, untested: roster.length, tests: 0,
      },
      recall: await rescreenRecall(roster),
      scope,
    };
  }

  const scrWhere = { athleteId: { [Op.in]: ids } };
  if (from || to) {
    // Validated rather than handed straight to the driver: `new Date('nonsense')`
    // is an Invalid Date, which MySQL rejected with "Incorrect DATETIME value" —
    // a 500, naming the engine, for what is plainly a malformed request.
    scrWhere.assessedAt = {};
    if (from) scrWhere.assessedAt[Op.gte] = date(from, 'from');
    if (to) scrWhere.assessedAt[Op.lte] = date(to, 'to');
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
  // Without a date filter `rows` IS every screening for this roster, so recall
  // can read it directly instead of re-querying the same table.
  const recall = await rescreenRecall(roster, from || to ? null : rows);
  return {
    ...result,
    // Coverage is the roster measured against the WINDOW, so a narrow from/to
    // correctly shows athletes as untested in that window.
    coverage: {
      rostered: roster.length,
      tested,
      untested: Math.max(0, roster.length - tested),
      tests: rows.length,
    },
    // Coverage says whether we tested them; recall says whether what we know is
    // still current. An administrator needs both to know who to call.
    recall,
    scope,
  };
}

// rescreenRecall is exported so the scheduled reminder reports against the SAME
// computation the dashboard and the PDF do. An email that disagreed with the
// screen about who is overdue would be worse than no email.
module.exports = { programmeActivityData, scopeLabel, rescreenRecall };
