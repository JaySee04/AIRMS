// Cohort-norm engine. Computes the mean + SD per screening component for each
// (sport, programme, gender) cohort — the reference distribution every athlete
// is z-scored against (redesign spec §5, §6). z-score + traffic-light against a
// sport/sex reference group is the accepted sports-science screening standard.
//
// Components are ORIENTED so higher always = better, so a positive z is always
// "better than the cohort". Six components:
//   totalScore, rom, stability, symmetry  — as printed (higher better)
//   riskGood  — negative mean of the 7 SHOWN exercise-risk indicators (LDH
//               excluded per Dr Thung); lower risk → higher good
//   balance   — negative mean left/right asymmetry from the subitem scores;
//               more symmetric → higher good (null when subitems weren't read)

const { Screening, Athlete, CohortThreshold } = require('../models');

const COMPONENTS = ['totalScore', 'rom', 'stability', 'symmetry', 'riskGood', 'balance'];

// The 7 exercise-risk indicators shown in AIRMS. spinalDiscHerniation (Lumbar
// Disc Herniation) is deliberately excluded — stored, never scored/displayed.
const SHOWN_RISK_KEYS = [
  'neckInjuryRisk', 'shoulderInjuryRisk', 'scoliosis',
  'lumbarPelvisInjury', 'jointPain', 'kneeInjuryRisk', 'ankleInjuryRisk',
];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Turn a screening row into the oriented component vector (higher = better).
function orientedComponents(s) {
  const risks = SHOWN_RISK_KEYS.map((k) => num(s[k])).filter((v) => v !== null);
  const riskGood = risks.length ? -(risks.reduce((a, b) => a + b, 0) / risks.length) : null;

  let balance = null;
  const sub = s.subitems;
  if (sub && typeof sub === 'object') {
    const diffs = [];
    for (const region of Object.values(sub)) {
      if (!region) continue;
      if (region.romL != null && region.romR != null) diffs.push(Math.abs(region.romL - region.romR));
      if (region.stabL != null && region.stabR != null) diffs.push(Math.abs(region.stabL - region.stabR));
    }
    if (diffs.length) balance = -(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }

  return {
    totalScore: num(s.totalScore),
    rom: num(s.rom),
    stability: num(s.stability),
    symmetry: num(s.symmetry),
    riskGood,
    balance,
  };
}

// Sample mean + (unbiased) standard deviation over the non-null values.
function meanSd(values) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.length > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1) : 0;
  return { mean: +mean.toFixed(3), sd: +Math.sqrt(variance).toFixed(3), n: v.length };
}

// { component: {mean, sd, n} } over a set of screenings. Also carries per-
// indicator {mean, sd} for the 7 SHOWN exercise-risk indicators (raw values,
// higher = worse) under their own keys — used by the per-indicator escalation
// (overallIndicator.js). Indicator keys never collide with component names.
function computeStats(screenings) {
  const comps = screenings.map(orientedComponents);
  const stats = {};
  for (const c of COMPONENTS) {
    const ms = meanSd(comps.map((x) => x[c]));
    if (ms) stats[c] = ms;
  }
  for (const k of SHOWN_RISK_KEYS) {
    const ms = meanSd(screenings.map((s) => num(s[k])));
    if (ms) stats[k] = ms;
  }
  return { n: screenings.length, stats };
}

// The four fallback-tier keys for an athlete, most specific first.
function tierKeysFor(athlete) {
  const sport = athlete.sport || null;
  const programme = athlete.program || athlete.programme || null;
  const gender = athlete.gender || null;
  return [
    { tier: 'spg', sport, programme, gender },
    { tier: 'sg', sport, programme: null, gender },
    { tier: 's', sport, programme: null, gender: null },
    { tier: 'all', sport: '*', programme: null, gender: null },
  ];
}

// The latest Screening per athlete, joined with the athlete's cohort keys.
// Excludes the columns no caller reads (posture, summaryText, muscleFlags —
// large JSON/TEXT blobs); `subitems` stays because orientedComponents' balance
// term needs it.
async function latestScreeningsByAthlete() {
  const [athletes, screenings] = await Promise.all([
    Athlete.findAll({ where: { isActive: true }, raw: true }),
    Screening.findAll({
      attributes: { exclude: ['posture', 'summaryText', 'muscleFlags'] },
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
      raw: true,
    }),
  ]);
  // raw:true returns attribute names (athleteId), not column names.
  const latest = new Map();
  for (const s of screenings) if (!latest.has(s.athleteId)) latest.set(s.athleteId, s);
  return athletes
    .map((a) => ({ athlete: a, screening: latest.get(a.athleteId) }))
    .filter((x) => x.screening);
}

// Recompute every cohort tier from the latest screenings and upsert the rows.
// New cohorts land as `pending`; existing rows keep their status + admin
// overrides but get refreshed computed stats. Returns a summary.
async function recomputeCohorts() {
  const rows = await latestScreeningsByAthlete();
  // Group screenings under each tier key they belong to.
  const groups = new Map(); // key string -> { keyObj, screenings[] }
  const add = (keyObj, s) => {
    const k = `${keyObj.tier}|${keyObj.sport}|${keyObj.programme}|${keyObj.gender}`;
    if (!groups.has(k)) groups.set(k, { keyObj, screenings: [] });
    groups.get(k).screenings.push(s);
  };
  for (const { athlete, screening } of rows) {
    for (const keyObj of tierKeysFor(athlete)) add(keyObj, screening);
  }

  // Preload existing rows once (no per-cohort findOne), then batch updates +
  // one bulkCreate for the new cohorts.
  const cohortKey = (o) => `${o.tier}|${o.sport}|${o.programme}|${o.gender}`;
  const existingRows = await CohortThreshold.findAll();
  const existingByKey = new Map(existingRows.map((r) => [cohortKey(r), r]));

  const updates = [];
  const toCreate = [];
  for (const { keyObj, screenings } of groups.values()) {
    const { n, stats } = computeStats(screenings);
    const existing = existingByKey.get(cohortKey(keyObj));
    if (existing) {
      updates.push(existing.update({ n, stats, computedAt: new Date() }));
    } else {
      toCreate.push({ sport: keyObj.sport, programme: keyObj.programme, gender: keyObj.gender, tier: keyObj.tier, n, stats, status: 'pending', computedAt: new Date() });
    }
  }
  await Promise.all(updates);
  if (toCreate.length) await CohortThreshold.bulkCreate(toCreate);
  return { cohorts: groups.size, created: toCreate.length, updated: updates.length };
}

// Build an in-memory lookup of the approved cohort rows, keyed by tier+keys,
// so callers can resolve many athletes without per-athlete queries.
function buildApprovedCohortMap(approvedRows) {
  const m = new Map();
  for (const r of approvedRows) m.set(`${r.tier}|${r.sport}|${r.programme}|${r.gender}`, r);
  return m;
}

// Resolve an athlete's cohort stats from a pre-loaded approved-cohort map via
// the fallback ladder. Returns { tier, n, stats } or null.
function resolveFromMap(athlete, map, { minN = 5, fallbackEnabled = true } = {}) {
  const keys = fallbackEnabled ? tierKeysFor(athlete) : [tierKeysFor(athlete)[0]];
  for (const k of keys) {
    const row = map.get(`${k.tier}|${k.sport}|${k.programme}|${k.gender}`);
    // Layer admin overrides (components only) over the computed stats, so the
    // per-indicator stats survive even when a cohort's components are overridden.
    if (row && row.n >= minN) return { tier: row.tier, n: row.n, stats: { ...row.stats, ...(row.overrides || {}) } };
  }
  return null;
}

// Single-athlete resolve (loads the approved rows itself). Used by callers that
// only need one athlete, e.g. the individual PDF report.
async function resolveCohortStats(athlete, opts = {}) {
  const approved = await CohortThreshold.findAll({ where: { status: 'approved' }, raw: true });
  return resolveFromMap(athlete, buildApprovedCohortMap(approved), opts);
}

module.exports = {
  COMPONENTS, SHOWN_RISK_KEYS,
  orientedComponents, meanSd, computeStats,
  tierKeysFor, latestScreeningsByAthlete,
  recomputeCohorts, resolveCohortStats, resolveFromMap, buildApprovedCohortMap,
};
