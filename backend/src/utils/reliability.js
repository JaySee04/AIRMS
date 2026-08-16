// How big does a change have to be before it means anything?
//
// AIRMS answers "is this athlete better or worse than last time" all over the
// place — the change chart, the between-tests panel, the seasonality ranking,
// the coach's movement arrows. Until now every one of them used the SAME magic
// constant: a change of 2 points or more was real, less than 2 was "steady".
// Nothing derived it. On a 0-100 scale, 2 was a guess.
//
// That guess is the single most-cited weakness of the whole traffic-light genre.
// Robertson, Bartlett & Gastin (IJSPP 2017), reviewing exactly this kind of
// system, put "evidence-based guidelines related to the determination of
// benchmarks and baselines and the subsequent boundaries used for categories"
// on their future-work list. A dead band nobody can justify is a threshold that
// silently decides which athletes get looked at.
//
// THE STANDARD METHOD (Hopkins; the MSK reliability literature)
//   typical error   TE    = SD of the within-athlete differences / sqrt(2)
//   minimal detectable change
//                   MDC95 = 1.96 * sqrt(2) * TE  ( = 2.77 * TE )
// A change smaller than MDC95 cannot be distinguished from measurement noise at
// 95% confidence. That is the number the dead band should be.
//
// THE HONEST CAVEAT, AND WHY IT IS THE SAFE DIRECTION
// A true test-retest needs two measurements close enough together that nothing
// real changed. AIRMS only has screenings months apart, which contain genuine
// change on top of measurement error, so this SD is inflated and the resulting
// MDC95 is an UPPER BOUND on the instrument's error rather than the error
// itself. That errs toward calling real changes "steady" — under-claiming, not
// over-claiming — which is the right way round for a band that decides whether
// a clinician is asked to look at somebody. The output says so, everywhere it
// is displayed, rather than presenting a bound as a measurement.
//
// AND IT DECLINES. Below `minPairs` repeat screenings the estimate is not
// stable, so it reports `sufficient: false` and the caller keeps the documented
// fallback. Same discipline as seasonality() refusing to name a quarter under
// two years of data: a confidently wrong threshold here would quietly change
// who gets assessed.

const { PERIOD_SCORES } = require('./periodScores');

// Below this many repeat pairs the SD of differences is too unstable to set a
// clinical threshold from. The reliability literature commonly works with
// 20-30 repeats; this is the low end of that, because ISN's roster is small and
// demanding 50 would mean never deriving one at all.
const MIN_PAIRS = 20;

// Used when the data cannot support an estimate. This is the value the whole
// system used unconditionally before — keeping it as the fallback means nothing
// regresses, and it is now labelled as the assumption it always was.
const FALLBACK_DEAD_BAND = 2;

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Sample SD (n-1), matching the cohort scorer's convention. */
function sd(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Every consecutive same-athlete pair of screenings, oldest first.
 *
 * ONE definition of "a retest pair" for the whole codebase. The between-tests
 * panel and this module both walk the same relation, and they must agree about
 * it exactly: the panel reports how many pairs moved, and the dead band it
 * judges "moved" against is derived from those same pairs. Two copies of the
 * grouping and sort rule could drift into measuring a threshold on one set of
 * pairs and applying it to another.
 *
 * Rows with an unparseable date are dropped rather than sorted arbitrarily,
 * and ties on date fall back to insertion id so the order is deterministic.
 *
 * @returns {{ pairs: Array<[object, object]>, athletesWithRetest: number }}
 */
function consecutivePairs(screenings) {
  const byAthlete = new Map();
  for (const s of screenings || []) {
    if (!byAthlete.has(s.athleteId)) byAthlete.set(s.athleteId, []);
    byAthlete.get(s.athleteId).push(s);
  }

  const pairs = [];
  let athletesWithRetest = 0;
  for (const [, rows] of byAthlete) {
    const sorted = rows
      .filter((r) => !Number.isNaN(new Date(r.assessedAt || 0).getTime()))
      .sort((a, b) => new Date(a.assessedAt) - new Date(b.assessedAt) || (a.id || 0) - (b.id || 0));
    if (sorted.length < 2) continue;
    athletesWithRetest += 1;
    for (let i = 1; i < sorted.length; i += 1) pairs.push([sorted[i - 1], sorted[i]]);
  }
  return { pairs, athletesWithRetest };
}

/** Every consecutive pair's difference, per score. Both readings required. */
function pairedDifferences(screenings) {
  const diffs = new Map(PERIOD_SCORES.map(([k]) => [k, []]));
  for (const [prev, cur] of consecutivePairs(screenings).pairs) {
    for (const [k] of PERIOD_SCORES) {
      const a = num(prev[k]);
      const b = num(cur[k]);
      if (a !== null && b !== null) diffs.get(k).push(b - a);
    }
  }
  return diffs;
}

/**
 * Per-score typical error and minimal detectable change.
 *
 * Returns one entry per score in PERIOD_SCORES:
 *   { key, label, pairs, movedPairs, te, mdc95, deadBand, sufficient, reason }
 * `deadBand` is always usable — it is MDC95 when the data supports one and the
 * documented fallback otherwise, so callers never have to branch.
 */
function reliability(screenings, { minPairs = MIN_PAIRS, fallback = FALLBACK_DEAD_BAND } = {}) {
  const diffs = pairedDifferences(screenings);

  const scores = PERIOD_SCORES.map(([key, label, higherBetter]) => {
    const d = diffs.get(key) || [];
    const moved = d.filter((x) => x !== 0).length;

    // A score that never moved across any pair has an SD of zero, which would
    // hand back a dead band of 0 and make every future rounding wobble a
    // "change". That is not a reliable instrument, it is an instrument that was
    // not re-measured — exactly the ingestion gap the between-tests panel
    // reports — so it is refused rather than believed.
    let reason = null;
    if (d.length < minPairs) reason = `only ${d.length} repeat${d.length === 1 ? '' : 's'} on record (needs ${minPairs})`;
    else if (moved === 0) reason = 'identical in every repeat — not re-measured';

    const s = reason ? null : sd(d);
    if (!reason && (s === null || s === 0)) reason = 'no variation between repeats';

    const te = reason ? null : s / Math.SQRT2;
    const mdc95 = te === null ? null : 1.96 * Math.SQRT2 * te;

    return {
      key,
      label,
      higherBetter,
      pairs: d.length,
      movedPairs: moved,
      te: te === null ? null : +te.toFixed(2),
      mdc95: mdc95 === null ? null : +mdc95.toFixed(2),
      deadBand: mdc95 === null ? fallback : +mdc95.toFixed(2),
      sufficient: mdc95 !== null,
      reason,
    };
  });

  const byKey = Object.fromEntries(scores.map((s) => [s.key, s]));
  return {
    scores,
    byKey,
    /** Dead band for one score, always a usable number. */
    deadBandFor: (key) => (byKey[key] ? byKey[key].deadBand : fallback),
    /** True when at least one score produced a real estimate. */
    anySufficient: scores.some((s) => s.sufficient),
    minPairs,
    fallback,
  };
}

module.exports = {
  reliability, consecutivePairs, pairedDifferences, sd, MIN_PAIRS, FALLBACK_DEAD_BAND,
};
