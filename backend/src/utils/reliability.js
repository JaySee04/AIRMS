// How big does a change have to be before it means anything?
//
// AIRMS answers "is this athlete better or worse than last time" all over the
// place — the change chart, the between-tests panel, the seasonality ranking,
// the coach's movement arrows. Until now every one of them used the SAME magic
// constant: a change of 2 points or more was real, less than 2 was "steady".
// Nothing derived it. On a 0-100 scale, 2 was a guess.
//
// A dead band nobody can justify is a threshold that silently decides which
// athletes get looked at, and it is the most-cited weakness of the genre:
// Robertson, Bartlett & Gastin (IJSPP 2017) list "the boundaries used for
// categories" as open work.
//
// Standard method (Hopkins; the MSK reliability literature):
//   TE    = SD of within-athlete differences / sqrt(2)
//   MDC95 = 2.77 * TE     (1.96 * sqrt(2) * TE)
// Below MDC95 a change cannot be told from measurement noise at 95% confidence.
//
// The caveat, which errs the safe way: a true test-retest needs measurements
// close enough together that nothing real changed, and AIRMS only has screenings
// months apart. The SD is inflated, so MDC95 is an UPPER BOUND — it under-calls
// change rather than over-calling it, which is the right direction for a band
// deciding whether a clinician is asked to look. Said so wherever displayed.
//
// And it DECLINES below `minPairs` pairs, reporting sufficient:false so the
// caller keeps the documented fallback — the same discipline as seasonality()
// refusing to name a quarter under two years of data.

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

    // Collapse readings that share an instant. Two rows with the same
    // assessedAt are not a retest — they are the same screening recorded
    // twice, which is what a second operator committing the same PDF produces
    // (the demo hands the same three reports to two people).
    //
    // Left in, each such pair contributes a difference of ZERO to every score,
    // and counts toward MIN_PAIRS. Measured on the real rows: two duplicate
    // commits take this from 18 pairs — correctly declining, dead band 2, and
    // saying so — to 20 pairs and a DERIVED dead band of 5.7 to 11.5. That is
    // the exact failure this module exists to prevent, reached by inflating the
    // numerator rather than by lowering the floor.
    const distinct = [];
    for (const r of sorted) {
      const prev = distinct[distinct.length - 1];
      if (prev && new Date(prev.assessedAt).getTime() === new Date(r.assessedAt).getTime()) continue;
      distinct.push(r);
    }
    if (distinct.length < 2) continue;
    athletesWithRetest += 1;
    for (let i = 1; i < distinct.length; i += 1) pairs.push([distinct[i - 1], distinct[i]]);
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
