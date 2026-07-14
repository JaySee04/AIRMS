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

// { component: {mean, sd, n} } over a set of screenings.
function computeStats(screenings) {
  const comps = screenings.map(orientedComponents);
  const stats = {};
  for (const c of COMPONENTS) {
    const ms = meanSd(comps.map((x) => x[c]));
    if (ms) stats[c] = ms;
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
async function latestScreeningsByAthlete() {
  const [athletes, screenings] = await Promise.all([
    Athlete.findAll({ where: { isActive: true }, raw: true }),
    Screening.findAll({ order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true }),
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

  let created = 0;
  let updated = 0;
  for (const { keyObj, screenings } of groups.values()) {
    const { n, stats } = computeStats(screenings);
    const where = {
      sport: keyObj.sport, programme: keyObj.programme, gender: keyObj.gender, tier: keyObj.tier,
    };
    const existing = await CohortThreshold.findOne({ where });
    if (existing) {
      await existing.update({ n, stats, computedAt: new Date() });
      updated++;
    } else {
      await CohortThreshold.create({ ...where, n, stats, status: 'pending', computedAt: new Date() });
      created++;
    }
  }
  return { cohorts: groups.size, created, updated };
}

// Resolve the applicable APPROVED cohort stats for an athlete via the fallback
// ladder, honouring the minimum-n setting. Returns { tier, n, stats } or null.
// Admin overrides (if present on the row) win over computed stats.
async function resolveCohortStats(athlete, { minN = 5, fallbackEnabled = true } = {}) {
  const keys = fallbackEnabled ? tierKeysFor(athlete) : [tierKeysFor(athlete)[0]];
  for (const k of keys) {
    const row = await CohortThreshold.findOne({
      where: { sport: k.sport, programme: k.programme, gender: k.gender, tier: k.tier, status: 'approved' },
    });
    if (row && row.n >= minN) {
      return { tier: row.tier, n: row.n, stats: row.overrides || row.stats };
    }
  }
  return null;
}

module.exports = {
  COMPONENTS, SHOWN_RISK_KEYS,
  orientedComponents, meanSd, computeStats,
  tierKeysFor, latestScreeningsByAthlete,
  recomputeCohorts, resolveCohortStats,
};
