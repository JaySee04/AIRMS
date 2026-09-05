// Turning a stored value into a number, once.
//
// MySQL DECIMAL columns arrive as STRINGS ('72.50'), JSON columns carry whatever
// the extractor wrote, and either can be null. So almost every module that does
// arithmetic on a screening needed a coercion helper, and seventeen of them
// wrote their own. They did not agree:
//
//   input        10 files      bodymap/pdfDraw/symmetry   screenings.js
//   ''           null          0                          0
//   null         null          null                       0
//   'abc'        null          null                       NaN
//   'Infinity'   Infinity      Infinity                   Infinity
//
// The disagreement is the defect, and it is the clinical kind. A missing
// reading that becomes 0 is not a blank — it is a NUMBER, and it is drawn:
// zero on a printed risk gauge reads as "no risk found", zero asymmetry reads
// as "perfectly balanced", and zero on a movement score reads as the worst
// possible result. None of those is what an absent reading means, and none of
// them looks like an error to the person holding the report.
//
// One rule now, and it resolves every divergence the same way: **an unknown
// value stays unknown.** Null, undefined, empty or blank string, and anything
// that is not a finite number all give `null`, so a caller has to decide what
// to draw for "we do not have this" instead of being handed a plausible zero.
//
// Non-finite is included deliberately. Ten of the copies returned `Infinity`
// unchanged, which would draw off the end of any axis it reached; two already
// used `Number.isFinite` and were right.
//
// See DESIGN_DECISIONS.md §54. frontend/src/lib/num.ts is the same function for
// the other package, and num.test.js runs BOTH over one table.

/**
 * @param {unknown} v a value from a DECIMAL column, a JSON blob or an API body
 * @returns {number|null} the number, or null if there isn't one
 */
function toNum(v) {
  // Only the types a stored reading can actually arrive as. Anything else is
  // rejected rather than coerced, because JS coercion invents zeros from
  // non-numbers: Number([]) is 0, Number(null) is 0, Number(false) is 0. Each
  // of those would draw as a real score. (This test caught Number([]) === 0 in
  // the first version of this very function.)
  if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'bigint') return null;
  // Number('') and Number('  ') are both 0 — the single most common way an
  // absent reading turns into a real-looking score.
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * `toNum`, but falling back to a caller-chosen number.
 *
 * For the few places that genuinely need a number rather than a null — a payload
 * typed as all-numeric, an accumulator. Named so the fabrication is VISIBLE at
 * the call site: `numOr(v, 0)` says a zero may be invented here, which
 * `num(v)` did not.
 */
function numOr(v, fallback) {
  const n = toNum(v);
  return n === null ? fallback : n;
}

/**
 * Arithmetic mean, or null for an empty set.
 *
 * Null rather than 0, for the same reason as `toNum`: the mean of nothing is
 * not zero, and a zero here would draw as a real average.
 *
 * Nulls are dropped rather than counted, so `mean` of a partly-unread set is
 * the average of what was actually read. Callers that need to know how many
 * that was should look — `meanSd` in cohorts.js reports `n` for exactly this
 * reason.
 */
function mean(values) {
  const v = (values || []).map(toNum).filter((x) => x !== null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Median, EXACT — the even case averages the two middle values and does not
 * round.
 *
 * There were three of these and they disagreed on precisely that: the two
 * backend copies rounded (`Math.round((s[m-1] + s[m]) / 2)`) and the chart's
 * did not. On an even set of [70, 75] the backend said 73 and the scatter plot
 * said 72.5 — and the scatter's quadrants are SPLIT on the median, so an
 * athlete sitting between the two answers is drawn in a different quadrant
 * depending on which copy ran. The docs already recorded the symptom without
 * the cause: "15 to 17 athletes, depending on how ties on the median are
 * counted".
 *
 * Exact is the correct default. The call sites that want a whole number of
 * DAYS round it themselves, which keeps every published figure identical and
 * puts the rounding where somebody can see it — the same reason `numOr` exists.
 */
function median(values) {
  const v = (values || []).map(toNum).filter((x) => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Round to `dp` decimals, preserving null.
 *
 * Three modules wanted "the mean, to one decimal" and each wrote its own
 * `(vals.length ? +(...).toFixed(1) : null)`. Splitting it into `round(mean(v), 1)`
 * keeps ONE mean — which drops unreadable values rather than counting them as
 * zero — and puts the presentation choice where it is visible.
 */
function round(v, dp = 0) {
  const n = toNum(v);
  if (n === null) return null;
  // `toFixed`, NOT `Math.round(n * 10 ** dp) / 10 ** dp`. They are not the same
  // function: the multiply-and-round version disagreed with the `toFixed(1)`
  // this replaced on about 1.1% of random sets, because a value like 77.85 is
  // held as 77.8499… so `toFixed` gives 77.8 while multiplying first gives 77.9.
  //
  // Either rule is defensible; silently switching between them is not. Every
  // cohort average, period average and subitem cell on every dashboard and
  // printed report is rounded here, so a changed rule would move published
  // numbers with nothing to attribute the change to.
  return +n.toFixed(dp);
}

module.exports = { toNum, numOr, mean, median, round };
