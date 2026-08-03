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

const { Screening, Athlete, CohortThreshold, AthleteDiscipline } = require('../models');
const { getSettings } = require('./settings');

const COMPONENTS = ['totalScore', 'rom', 'stability', 'symmetry', 'riskGood', 'balance'];

// Stable Map-key for a cohort tier row. Order is fixed and must match every
// caller (recompute grouping, approved-map, resolve). Discipline is only set on
// the spgd tier; '' on every coarser tier. (B2)
const cohortKeyOf = (o) => `${o.tier}|${o.sport}|${o.programme}|${o.gender}|${o.discipline || ''}`;

// A manual norm edit is considered to have "drifted" from the freshly computed
// value once any overridden component mean differs by more than this (means sit
// on 0–100-ish scales, so 0.5 filters float noise but catches real change).
const DRIFT_EPSILON = 0.5;

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

// The fallback-tier keys for an athlete, most specific first. The most-specific
// tier is spgd (sport+programme+gender+discipline) — one per discipline the
// athlete holds, so a multi-discipline athlete belongs to each; when a discipline
// cohort is too small it falls back through spg → sg → s → all exactly as before,
// so scoring is unchanged for athletes/sports without populated disciplines. (B2)
function tierKeysFor(athlete) {
  const sport = athlete.sport || null;
  const programme = athlete.program || athlete.programme || null;
  const gender = athlete.gender || null;
  const disciplines = Array.isArray(athlete.disciplines) ? athlete.disciplines : [];
  const keys = [];
  for (const d of disciplines) {
    if (d) keys.push({ tier: 'spgd', sport, programme, gender, discipline: d });
  }
  keys.push(
    { tier: 'spg', sport, programme, gender, discipline: null },
    { tier: 'sg', sport, programme: null, gender, discipline: null },
    { tier: 's', sport, programme: null, gender: null, discipline: null },
    { tier: 'all', sport: '*', programme: null, gender: null, discipline: null },
  );
  return keys;
}

// The latest Screening per athlete, joined with the athlete's cohort keys.
// Excludes the columns no caller reads (summaryText, muscleFlags —
// large JSON/TEXT blobs); `subitems` stays because orientedComponents' balance
// term needs it.
async function latestScreeningsByAthlete() {
  const [athletes, screenings, disciplineRows] = await Promise.all([
    Athlete.findAll({ where: { isActive: true }, raw: true }),
    Screening.findAll({
      attributes: { exclude: ['summaryText', 'muscleFlags'] },
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
      raw: true,
    }),
    AthleteDiscipline.findAll({ raw: true }),
  ]);
  // raw:true returns attribute names (athleteId), not column names.
  const latest = new Map();
  for (const s of screenings) if (!latest.has(s.athleteId)) latest.set(s.athleteId, s);
  // Athlete → their disciplines (drives the spgd tier). (B2)
  const discByAthlete = new Map();
  for (const d of disciplineRows) {
    const arr = discByAthlete.get(d.athleteId) || [];
    arr.push(d.discipline); discByAthlete.set(d.athleteId, arr);
  }
  return athletes
    .map((a) => ({ athlete: { ...a, disciplines: discByAthlete.get(a.athleteId) || [] }, screening: latest.get(a.athleteId) }))
    .filter((x) => x.screening);
}

// Unified cohort-norm MEMBERSHIP model (B3 + B4 + B5). Whether an athlete's
// latest screening should COUNT toward norm calculation. One resolver, one
// reason, so the admin UI and the engine agree on who's in and why they're out:
//   injured (B4) → manually excluded (B3) → below an admin threshold (B5).
// Eligibility affects norm COMPUTATION only — every athlete is still SCORED
// against the resulting norm. `settings` come from getSettings().
function isEligibleForNorms(athlete, screening, settings = {}) {
  if (athlete.isInjured) return { eligible: false, reason: 'injured' };
  if (athlete.normExcluded) return { eligible: false, reason: 'excluded' };
  const gates = [
    ['below-total', Number(settings.norm_min_total) || 0, num(screening && screening.totalScore)],
    ['below-rom', Number(settings.norm_min_rom) || 0, num(screening && screening.rom)],
    ['below-stability', Number(settings.norm_min_stability) || 0, num(screening && screening.stability)],
  ];
  for (const [reason, min, value] of gates) {
    if (min > 0 && (value === null || value < min)) return { eligible: false, reason };
  }
  return { eligible: true, reason: null };
}

// Per-component drift between a cohort's manual override and its freshly
// computed stats. Drives the "review — new data" prompt on the Cohort page:
// the manual norm stays live, but the admin/medical lead is told the data has
// moved so they can decide whether to keep or refresh it.
function cohortReview(row) {
  const ov = (row.overrides && typeof row.overrides === 'object') ? row.overrides : {};
  const stats = (row.stats && typeof row.stats === 'object') ? row.stats : {};
  const items = [];
  for (const k of Object.keys(ov)) {
    const manual = ov[k] && typeof ov[k].mean === 'number' ? ov[k].mean : null;
    const computed = stats[k] && typeof stats[k].mean === 'number' ? stats[k].mean : null;
    if (manual === null || computed === null) continue;
    const delta = +(computed - manual).toFixed(3);
    if (Math.abs(delta) > DRIFT_EPSILON) items.push({ component: k, manual, computed, delta });
  }
  return { needed: items.length > 0, items };
}

// Screening scores tracked for previous-vs-latest movement (higher=better
// except exerciseRisks). Shared by the admin Screening Analytics trend.
const TREND_SCORES = [
  ['totalScore', 'Total Score', true],
  ['rom', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['exerciseRisks', 'Exercise Risks', false],
];
const BAND_RANK = { green: 0, amber: 1, red: 2 };

// Previous-vs-latest screening movement from a flat list of screening rows
// (each { athleteId, assessedAt, id, totalScore, rom, stability, symmetry,
// exerciseRisks, overallIndicator, overallBand, overrideBand }). Pure — no DB —
// so it's unit-testable. Returns { trend }: comparable (athletes with ≥2
// screenings), improving/declining/steady by overall-indicator momentum
// (±`noise`), band moves, and avg per-score delta.
function screeningMovement(screenings, { noise = 2 } = {}) {
  const sorted = [...(screenings || [])].sort((a, b) => {
    const t = new Date(b.assessedAt || 0) - new Date(a.assessedAt || 0);
    return t !== 0 ? t : (b.id || 0) - (a.id || 0);
  });
  const byAth = new Map();
  for (const s of sorted) {
    const arr = byAth.get(s.athleteId) || [];
    if (arr.length < 2) { arr.push(s); byAth.set(s.athleteId, arr); }
  }
  const trend = { comparable: 0, improving: 0, declining: 0, steady: 0, deltas: [], bandMoves: { better: 0, worse: 0 } };
  const sums = new Map(TREND_SCORES.map(([k]) => [k, { sum: 0, n: 0 }]));
  for (const [, pair] of byAth) {
    if (pair.length < 2) continue;
    const [latest, prev] = pair;
    trend.comparable++;
    for (const [k] of TREND_SCORES) {
      const a = Number(prev[k]); const b = Number(latest[k]);
      if (Number.isFinite(a) && Number.isFinite(b)) { const acc = sums.get(k); acc.sum += b - a; acc.n++; }
    }
    const di = Number(latest.overallIndicator) - Number(prev.overallIndicator);
    if (Number.isFinite(di)) { if (di >= noise) trend.improving++; else if (di <= -noise) trend.declining++; else trend.steady++; }
    const pb = BAND_RANK[prev.overrideBand || prev.overallBand];
    const lb = BAND_RANK[latest.overrideBand || latest.overallBand];
    if (pb != null && lb != null) { if (lb < pb) trend.bandMoves.better++; else if (lb > pb) trend.bandMoves.worse++; }
  }
  trend.deltas = TREND_SCORES.map(([k, label, higherBetter]) => {
    const acc = sums.get(k);
    return { key: k, label, higherBetter, avgDelta: acc.n ? +(acc.sum / acc.n).toFixed(1) : null };
  });
  return { trend };
}

// Recompute every cohort tier from the latest screenings and upsert the rows.
// A norm auto-generates + goes LIVE on every import: new cohorts are stored
// approved (no manual gate — the norm is the cohort average by definition).
// Existing rows keep their manual overrides by default; the caller/UI flags any
// that have drifted from the new data (see cohortReview). When the
// `norm_auto_overwrite` setting is ON, an import instead clears manual edits so
// the freshly computed norm wins. Returns a summary.
async function recomputeCohorts() {
  const settings = await getSettings();
  const autoOverwrite = settings.norm_auto_overwrite === true;
  const rows = await latestScreeningsByAthlete();
  // Only athletes eligible for norm calculation shape the reference distribution
  // (injured / manually excluded / below an admin threshold are dropped here —
  // they're still scored against the norm elsewhere). See isEligibleForNorms.
  const eligibleRows = rows.filter(({ athlete, screening }) => isEligibleForNorms(athlete, screening, settings).eligible);
  // Group screenings under each tier key they belong to.
  const groups = new Map(); // key string -> { keyObj, screenings[] }
  const add = (keyObj, s) => {
    const k = cohortKeyOf(keyObj);
    if (!groups.has(k)) groups.set(k, { keyObj, screenings: [] });
    groups.get(k).screenings.push(s);
  };
  for (const { athlete, screening } of eligibleRows) {
    for (const keyObj of tierKeysFor(athlete)) add(keyObj, screening);
  }

  // Preload existing rows once (no per-cohort findOne), then batch updates +
  // one bulkCreate for the new cohorts.
  const existingRows = await CohortThreshold.findAll();
  const existingByKey = new Map(existingRows.map((r) => [cohortKeyOf(r), r]));

  const updates = [];
  const toCreate = [];
  for (const { keyObj, screenings } of groups.values()) {
    const { n, stats } = computeStats(screenings);
    const existing = existingByKey.get(cohortKeyOf(keyObj));
    if (existing) {
      const patch = { n, stats, computedAt: new Date() };
      // Auto-overwrite ON → drop any manual edit so the computed norm governs.
      if (autoOverwrite && existing.overrides) patch.overrides = null;
      updates.push(existing.update(patch));
    } else {
      // New cohort → store the auto-generated norm LIVE (approved), stamped as
      // an automatic origin so the UI can distinguish it from a human approval.
      toCreate.push({
        sport: keyObj.sport, programme: keyObj.programme, gender: keyObj.gender, discipline: keyObj.discipline || null, tier: keyObj.tier,
        n, stats, status: 'approved', computedAt: new Date(), approvedAt: new Date(), approvedBy: 'auto (import)',
      });
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
  for (const r of approvedRows) m.set(cohortKeyOf(r), r);
  return m;
}

// Resolve an athlete's cohort stats from a pre-loaded approved-cohort map via
// the fallback ladder. Returns { tier, n, stats } or null.
function resolveFromMap(athlete, map, { minN = 5, fallbackEnabled = true } = {}) {
  const keys = fallbackEnabled ? tierKeysFor(athlete) : [tierKeysFor(athlete)[0]];
  for (const k of keys) {
    const row = map.get(cohortKeyOf(k));
    // Layer admin overrides (components only) over the computed stats, so the
    // per-indicator stats survive even when a cohort's components are overridden.
    if (row && row.n >= minN) return { tier: row.tier, discipline: row.discipline || null, n: row.n, stats: { ...row.stats, ...(row.overrides || {}) } };
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
  cohortReview, screeningMovement, isEligibleForNorms, cohortKeyOf,
};
