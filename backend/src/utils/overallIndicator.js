// Overall risk indicator — the Total Score of Athleticism (TSA) composite:
// z-score each oriented screening component against the athlete's cohort and
// average the z-scores (equal weight — the published TSA default), then band by
// ESCALATION, matching Dr Thung's spec (redesign spec §5):
//
//   base = green (safe)
//   +1 escalation if the athlete is BELOW the cohort mean (composite z < 0)
//   +1 escalation if the athlete is among the BOTTOM-k of the cohort
//   band: 0 escalations = green · 1 = amber (needs attention) · 2 = red
//         (immediate assessment)
//
// So a "good raw score" athlete who is nonetheless below his cohort and among
// the worst performers escalates twice → red, exactly as specified.

const { orientedComponents, COMPONENTS } = require('./cohorts');

const BANDS = ['green', 'amber', 'red'];

// Composite z of a screening against cohort stats ({component:{mean,sd}}).
// Averages the available component z-scores (TSA). Returns null if none usable.
function compositeZ(screening, cohortStats) {
  if (!cohortStats) return null;
  const comps = orientedComponents(screening);
  const zs = [];
  for (const c of COMPONENTS) {
    const v = comps[c];
    const st = cohortStats[c];
    if (v === null || v === undefined || !st || !st.sd) continue;
    zs.push((v - st.mean) / st.sd);
  }
  if (!zs.length) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

// Map composite z to a 0–100 display score (50 = cohort mean; ±3 SD → 0/100).
function zToScore(z) {
  return Math.max(0, Math.min(100, Math.round(50 + z * (50 / 3))));
}

// Full indicator. `rankInfo` = { rank, total } of this athlete within the
// cohort (rank 1 = worst by composite z); pass null if unranked.
// Returns { indicator, band, escalations, z, factors }.
function computeIndicator(screening, cohortStats, rankInfo, settings = {}) {
  const z = compositeZ(screening, cohortStats);
  if (z === null) {
    return { indicator: null, band: null, escalations: 0, z: null, factors: ['insufficient cohort data'] };
  }
  const factors = [];
  let escalations = 0;
  if (settings.escalation_below_mean !== false && z < 0) {
    escalations++;
    factors.push('below cohort average');
  }
  const k = settings.bottom_k ?? 3;
  if (settings.escalation_bottom_k !== false && rankInfo && rankInfo.rank <= k) {
    escalations++;
    factors.push(`bottom ${k} of ${rankInfo.total} in cohort`);
  }
  const band = BANDS[Math.min(BANDS.length - 1, escalations)];
  return { indicator: zToScore(z), band, escalations, z: +z.toFixed(3), factors };
}

// Cohort identity an athlete resolves to at a given tier — peers who share this
// string are ranked against each other.
function resolvedCohortId(a, tier) {
  const sport = a.sport;
  const prog = a.program || a.programme;
  const gender = a.gender;
  if (tier === 'spg') return `spg|${sport}|${prog}|${gender}`;
  if (tier === 'sg') return `sg|${sport}|${gender}`;
  if (tier === 's') return `s|${sport}`;
  return 'all';
}

// Recompute every athlete's overall indicator from the approved cohorts and
// store it on their latest Screening row. Run after an import and after a
// cohort is approved/edited. Returns a summary.
async function recomputeIndicators() {
  const { Screening, CohortThreshold } = require('../models');
  const { latestScreeningsByAthlete, resolveFromMap, buildApprovedCohortMap } = require('./cohorts');
  const { getSettings } = require('./settings');
  const settings = await getSettings();
  const opts = { minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled };

  // Load latest screenings + approved cohorts once; resolve each athlete in
  // memory (no per-athlete cohort queries).
  const [rows, approved] = await Promise.all([
    latestScreeningsByAthlete(),
    CohortThreshold.findAll({ where: { status: 'approved' }, raw: true }),
  ]);
  const cohortMap = buildApprovedCohortMap(approved);
  const enriched = rows.map(({ athlete, screening }) => {
    const resolved = resolveFromMap(athlete, cohortMap, opts);
    const z = resolved ? compositeZ(screening, resolved.stats) : null;
    return { athlete, screening, resolved, z };
  });

  // Rank within each resolved cohort (rank 1 = lowest z = worst performer).
  const groups = new Map();
  for (const e of enriched) {
    if (!e.resolved || e.z === null) continue;
    const id = resolvedCohortId(e.athlete, e.resolved.tier);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(e);
  }
  const rankOf = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => a.z - b.z);
    group.forEach((e, i) => rankOf.set(e.screening.id, { rank: i + 1, total: group.length }));
  }

  let scored = 0;
  const updates = enriched.map((e) => {
    const rankInfo = rankOf.get(e.screening.id) || null;
    const r = computeIndicator(e.screening, e.resolved ? e.resolved.stats : null, rankInfo, settings);
    if (r.indicator !== null) scored++;
    return Screening.update(
      { overallIndicator: r.indicator, overallBand: r.band, escalations: r.escalations },
      { where: { id: e.screening.id } },
    );
  });
  await Promise.all(updates);
  return { athletes: enriched.length, scored };
}

module.exports = { computeIndicator, compositeZ, zToScore, BANDS, resolvedCohortId, recomputeIndicators };
