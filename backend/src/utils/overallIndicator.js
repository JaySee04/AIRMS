// Overall risk indicator — the Total Score of Athleticism (TSA) composite:
// z-score each oriented screening component against the athlete's cohort and
// average the z-scores (equal weight — the published TSA default), then band by
// ESCALATION, matching Dr Thung's spec (redesign spec §5):
//
//   base = green (safe)
//   +1 escalation if the athlete is BELOW the cohort mean (composite z < 0)
//   +1 escalation if the athlete is among the BOTTOM-k of the cohort
//   +1 escalation if any single exercise-risk indicator is BOTH over the
//     Elevated threshold AND the athlete is a peer-outlier on that indicator
//     (per-indicator z ≥ cutoff vs the cohort). This is the "peers AND the
//     threshold" rule: a threshold breach alone won't escalate (>90% of the
//     squad trips one), only a breach where the athlete is also clearly worse
//     than their cohort on that specific measure. Admin-toggleable.
//   band: 0 escalations = green · 1 = amber (needs attention) · ≥2 = red
//         (immediate assessment). The count reaches at most 3.
//
// So a "good raw score" athlete who is nonetheless below his cohort and among
// the worst performers escalates twice → red, exactly as specified.

const { orientedComponents, COMPONENTS, SHOWN_RISK_KEYS } = require('./cohorts');

const BANDS = ['green', 'amber', 'red'];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Display labels for the per-indicator escalation factor text.
const INDICATOR_LABELS = {
  neckInjuryRisk: 'Neck', shoulderInjuryRisk: 'Shoulder', scoliosis: 'Scoliosis',
  lumbarPelvisInjury: 'Lumbar/Pelvis', jointPain: 'Joint Pain', kneeInjuryRisk: 'Knee', ankleInjuryRisk: 'Ankle',
};

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

// The share of a cohort the "worst performers" escalation may cover. bottom_k
// (default 3) was chosen with real ISN cohort sizes in mind (~15–30 athletes),
// where it means roughly the worst 10–20%. Applied literally to a 5-athlete
// cohort it means the worst 60% — which is not "among the worst", it is most
// of the group, and it made ~42% of the squad band red. Expressing the rule as
// a proportion keeps it meaning the same thing at every cohort size, while
// bottom_k stays the admin's absolute ceiling. See docs/fyp/FYP2_REDESIGN_SPEC.md §5.
const BOTTOM_SHARE = 0.2;

// The effective k for a cohort of n: the admin's bottom_k, capped so it never
// covers more than BOTTOM_SHARE of the cohort (but always at least 1).
function effectiveK(n, settings = {}) {
  const k = settings.bottom_k ?? 3;
  if (!n || n <= 0) return k;
  return Math.min(k, Math.max(1, Math.floor(n * BOTTOM_SHARE)));
}

// Full indicator. `rankInfo` = { rank, total, k } of this athlete within the
// cohort (rank 1 = worst by composite z; k = the effective bottom-k for that
// cohort); pass null if unranked.
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
  const k = rankInfo?.k ?? effectiveK(rankInfo?.total, settings);
  if (settings.escalation_bottom_k !== false && rankInfo && rankInfo.rank <= k) {
    escalations++;
    factors.push(`bottom ${k} of ${rankInfo.total} in cohort`);
  }
  // Per-indicator escalation: an exercise-risk indicator over the Elevated
  // threshold AND on which the athlete is a peer-outlier (z ≥ cutoff vs the
  // cohort's mean/SD for that indicator; higher raw value = worse). Fires on the
  // single worst-outlier indicator only (one +1, not one per indicator).
  if (settings.escalation_indicator !== false && cohortStats) {
    const high = settings.escalation_indicator_high ?? 25;
    const zCut = settings.escalation_indicator_z ?? 1.5; // match settings default (1.0 over-escalates ~half the squad)
    let worst = null;
    for (const key of SHOWN_RISK_KEYS) {
      const v = num(screening[key]);
      const st = cohortStats[key];
      if (v === null || v < high || !st || !st.sd) continue;
      const zi = (v - st.mean) / st.sd;
      if (zi >= zCut && (!worst || zi > worst.zi)) worst = { key, v, zi };
    }
    if (worst) {
      escalations++;
      factors.push(`${INDICATOR_LABELS[worst.key] || worst.key} ${worst.v} — over threshold (≥${high}) and worse than cohort (z=${worst.zi.toFixed(2)})`);
    }
  }
  // Screening escalations set the band: 0 = green · 1 = amber · ≥2 = red.
  const band = BANDS[Math.min(BANDS.length - 1, escalations)];
  return { indicator: zToScore(z), band, escalations, z: +z.toFixed(3), factors };
}

// Cohort identity an athlete resolves to. `resolved` is the object returned by
// resolveFromMap ({ tier, discipline, ... }) — spgd carries a discipline. (B2)
function resolvedCohortId(a, resolved) {
  const sport = a.sport;
  const prog = a.program || a.programme;
  const gender = a.gender;
  const tier = resolved.tier;
  if (tier === 'spgd') return `spgd|${sport}|${prog}|${gender}|${resolved.discipline}`;
  if (tier === 'spg') return `spg|${sport}|${prog}|${gender}`;
  if (tier === 'sg') return `sg|${sport}|${gender}`;
  if (tier === 's') return `s|${sport}`;
  return 'all';
}

// Does this athlete BELONG to the cohort `id` — i.e. would they be counted in
// its mean/SD — regardless of which tier they themselves resolved to?
//
// This is the distinction that matters for ranking. An athlete whose most
// specific cohort is too small falls back a tier, so a broad cohort like
// `s|Athletics` is normed over ALL 11 Athletics athletes but was previously
// RANKED over only the handful who also happened to fall back to it. Two live
// groups had 2 members with bottom_k = 3, so both were automatically "bottom 3"
// → auto-escalated → red. The spec says "bottom k of cohort" (§5), so the
// ranking peers must be the cohort's membership, not the fallback stragglers.
function belongsToCohort(a, id) {
  const parts = id.split('|');
  const tier = parts[0];
  const prog = a.program || a.programme;
  if (tier === 'all') return true;
  if (tier === 's') return a.sport === parts[1];
  if (tier === 'sg') return a.sport === parts[1] && a.gender === parts[2];
  // spgd: also requires the athlete to hold that discipline. (B2)
  if (tier === 'spgd') {
    return a.sport === parts[1] && prog === parts[2] && a.gender === parts[3]
      && Array.isArray(a.disciplines) && a.disciplines.includes(parts[4]);
  }
  // spg
  return a.sport === parts[1] && prog === parts[2] && a.gender === parts[3];
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
  // memory (no per-athlete queries).
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

  // Rank each athlete within the cohort they were NORMED against (rank 1 =
  // lowest z = worst performer). The peers are that cohort's full membership,
  // not just the athletes who happened to fall back to the same tier — see
  // belongsToCohort() above for why that distinction matters.
  //
  // Every peer's z is recomputed against THIS cohort's stats so the ranking is
  // like-for-like: a peer who resolved to a narrower tier is scored on their
  // own ruler for their own band, but on this cohort's ruler when acting as a
  // yardstick here. Cost is O(distinct cohorts × athletes) — ~11 × 59 in the
  // seeded set, so it stays comfortably inside the post-import recompute.
  const scoredAthletes = enriched.filter((e) => e.resolved && e.z !== null);
  const cohortIds = [...new Set(scoredAthletes.map((e) => resolvedCohortId(e.athlete, e.resolved)))];
  const rankOf = new Map();
  for (const id of cohortIds) {
    // Any athlete resolving to this id shares its stats, so take the first.
    const stats = scoredAthletes.find((e) => resolvedCohortId(e.athlete, e.resolved) === id).resolved.stats;
    const peerZs = enriched
      .filter((e) => belongsToCohort(e.athlete, id))
      .map((e) => compositeZ(e.screening, stats))
      .filter((z) => z !== null)
      .sort((a, b) => a - b);
    const k = effectiveK(peerZs.length, settings);
    for (const e of scoredAthletes) {
      if (resolvedCohortId(e.athlete, e.resolved) !== id) continue;
      // rank 1 = worst; ties share the best (highest) rank of the tied block.
      const rank = peerZs.findIndex((z) => z >= e.z) + 1;
      rankOf.set(e.screening.id, { rank: rank || peerZs.length, total: peerZs.length, k });
    }
  }

  let scored = 0;
  const updates = enriched.map((e) => {
    const rankInfo = rankOf.get(e.screening.id) || null;
    const r = computeIndicator(e.screening, e.resolved ? e.resolved.stats : null, rankInfo, settings);
    if (r.indicator !== null) scored++;
    return Screening.update(
      { overallIndicator: r.indicator, overallBand: r.band, escalations: r.escalations, factors: r.factors },
      { where: { id: e.screening.id } },
    );
  });
  await Promise.all(updates);
  return { athletes: enriched.length, scored };
}

module.exports = {
  computeIndicator, compositeZ, zToScore, BANDS,
  resolvedCohortId, belongsToCohort, effectiveK, BOTTOM_SHARE,
  recomputeIndicators,
};
