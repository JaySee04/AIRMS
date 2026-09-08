// Turning an API value into a number, once. The frontend half of
// backend/src/utils/num.js — see that file for why seventeen private copies of
// this existed and how they disagreed.
//
// The short version: MySQL DECIMAL columns reach the browser as strings, and a
// missing reading coerced to 0 is not a blank. It is a number, and it gets
// drawn — zero on a risk strip reads as "no risk found", zero on a movement
// score reads as the worst possible result. So an unknown value stays unknown.
//
// `num.test.ts` runs this and the backend's implementation over ONE table, so
// the two cannot drift into disagreeing about what an empty cell means.

/** The number, or null if there isn't one. */
export function toNum(v: unknown): number | null {
  // Only the types a stored reading can actually arrive as. Anything else is
  // rejected rather than coerced, because JS coercion invents zeros from
  // non-numbers: Number([]) is 0, Number(null) is 0, Number(false) is 0. Each
  // of those would draw as a real score.
  if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'bigint') return null;
  // Number('') and Number('  ') are both 0 — the commonest way an absent
  // reading turns into a real-looking score.
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * `toNum`, but falling back to a caller-chosen number.
 *
 * Named so the fabrication is VISIBLE at the call site: `numOr(v, 0)` says a
 * zero may be invented here, which a bare `num(v)` did not.
 */
export function numOr(v: unknown, fallback: number): number {
  const n = toNum(v);
  return n === null ? fallback : n;
}

/** Arithmetic mean of the readable values, or null for none. */
export function mean(values: unknown[]): number | null {
  const v = (values || []).map(toNum).filter((x): x is number => x !== null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Median, EXACT — the even case averages the two middle values, unrounded.
 *
 * There were three of these and they disagreed on exactly that: the backend's
 * two copies rounded and this one did not, so on [70, 75] one said 73 and the
 * other 72.5. The scatter plot's quadrants are split on the median, so an
 * athlete between those answers was drawn in a different quadrant depending on
 * which copy ran. Call sites wanting a whole number of days round it
 * themselves. See backend/src/utils/num.js.
 */
export function median(values: unknown[]): number | null {
  const v = (values || []).map(toNum).filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Round to `dp` decimals, preserving null. The mirror of `round` in
 * backend/src/utils/num.js, and it must stay the mirror.
 *
 * `toFixed`, NOT `Math.round(n * 10 ** dp) / 10 ** dp`. Those are different
 * functions: 77.85 is held as 77.8499…, so `toFixed(1)` gives 77.8 while
 * multiplying first gives 77.9, and they disagree on about 1.1% of values
 * (§57). Every cohort, period and subitem average on every dashboard and
 * printed report is rounded through the backend's copy — a frontend panel
 * rounding the same figure the other way would print a different number for the
 * same data, on the same screen as the value it came from.
 *
 * It arrived here later than the backend's, which is itself the finding: §57
 * added `round` to one half of a pair this project keeps deliberately in step,
 * and nothing noticed until a page needed it. num.test.ts runs one table
 * through both.
 */
export function round(v: unknown, dp = 0): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return +n.toFixed(dp);
}
