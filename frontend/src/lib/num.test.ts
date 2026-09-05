// One table, run through BOTH packages' implementations.
//
// `toNum` is behaviour, not a fact, so it is not generated from shared/facts.js
// (§53.8 draws that line: values are trivially portable, behaviour is not).
// That leaves two implementations, so the table below is run through both and
// the frontend suite fails if they ever disagree.
//
// The cases are not decorative. Seventeen private copies of this function
// existed and they differed on exactly these inputs — an empty string was null
// in ten of them and 0 in four, and one returned 0 for null and NaN for a
// non-numeric string. Every row here is a real disagreement that shipped.
import path from 'path';
import { toNum, numOr, mean, median } from './num';

const be = require(path.join(__dirname, '..', '..', '..', 'backend', 'src', 'utils', 'num.js'));

// [input, expected] — the contract, stated once.
const TABLE: Array<[unknown, number | null]> = [
  // The value that caused the trouble. Number('') is 0, so a missing reading
  // became a real-looking score: zero on a printed risk gauge reads as "no risk
  // found", and zero asymmetry reads as "perfectly balanced".
  ['', null],
  ['   ', null],
  [null, null],
  [undefined, null],

  // MySQL DECIMAL columns arrive as strings. This is the ordinary case.
  ['72.50', 72.5],
  ['0', 0],
  ['-3.25', -3.25],
  [0, 0],
  [42, 42],

  // Not a number, however plausible it looks.
  ['abc', null],
  ['12abc', null],
  [NaN, null],
  [{}, null],
  [[], null],

  // Non-finite. Ten copies returned Infinity unchanged, which draws off the end
  // of any axis it reaches.
  ['Infinity', null],
  [Infinity, null],
  [-Infinity, null],
];

describe('toNum', () => {
  it.each(TABLE)('%p -> %p', (input, expected) => {
    expect(toNum(input)).toBe(expected);
  });

  it('agrees with the backend on every case, which is the point of the table', () => {
    // A divergence here is the defect the unification removed, coming back.
    for (const [input] of TABLE) {
      expect({ input, value: toNum(input) }).toEqual({ input, value: be.toNum(input) });
    }
  });

  it('never returns NaN — the value that survives a comparison and loses a chart', () => {
    // NaN is the worst answer available: NaN < 15 is false, so a threshold check
    // silently passes, and the bar draws at zero width with no error anywhere.
    for (const [input] of TABLE) expect(Number.isNaN(toNum(input) as number)).toBe(false);
  });
});

describe('numOr', () => {
  it('substitutes the fallback only where there is no number', () => {
    expect(numOr('', 0)).toBe(0);
    expect(numOr(null, 0)).toBe(0);
    expect(numOr('abc', 0)).toBe(0);
    expect(numOr('72.5', 0)).toBe(72.5);
    // A real zero is a reading, not a fallback, and must survive as itself.
    expect(numOr('0', 9)).toBe(0);
  });

  it('agrees with the backend', () => {
    for (const [input] of TABLE) expect(numOr(input, -1)).toBe(be.numOr(input, -1));
  });
});

// ── mean / median ───────────────────────────────────────────────────────────
//
// There were three medians and they disagreed on the EVEN case: the backend's
// two rounded, the chart's did not, so [70, 75] was 73 on one side and 72.5 on
// the other. The scatter's quadrants are split on the median, so an athlete
// between those two answers was drawn in a different quadrant depending on
// which copy ran — and the docs had already recorded the symptom ("15 to 17,
// depending on how ties on the median are counted") without the cause.
const SETS: Array<[unknown[], number | null, number | null]> = [
  // values                    mean          median
  [[], null, null],
  [[5], 5, 5],
  [[1, 2, 3], 2, 2],
  // The even case — the whole reason this is one function now.
  [[70, 75], 72.5, 72.5],
  [[71, 72], 71.5, 71.5],
  [[60, 61, 80, 81], 70.5, 70.5],
  // Order must not matter to a median.
  [[81, 60, 80, 61], 70.5, 70.5],
  // Strings from DECIMAL columns, and unreadable values DROPPED rather than
  // counted as zero — a zero in the set would drag both statistics down.
  [['70', '75'], 72.5, 72.5],
  [[70, null, 75, '', 'abc'], 72.5, 72.5],
  [[null, undefined, ''], null, null],
];

describe('mean and median', () => {
  it.each(SETS)('%p -> mean %p, median %p', (values, m, md) => {
    expect(mean(values)).toBe(m);
    expect(median(values)).toBe(md);
  });

  it('agrees with the backend on every set', () => {
    for (const [values] of SETS) {
      expect({ mean: mean(values), median: median(values) })
        .toEqual({ mean: be.mean(values), median: be.median(values) });
    }
  });

  it('does NOT round the even case — that was the divergence', () => {
    // If this ever reads 73, the rounding has been pushed back inside median()
    // and the scatter's quadrant boundary has moved with it. The two call sites
    // that want whole days round it themselves.
    expect(median([70, 75])).toBe(72.5);
    expect(Math.round(median([70, 75]) as number)).toBe(73); // what those sites do
  });

  it('drops unreadable values instead of counting them as zero', () => {
    expect(mean([10, ''])).toBe(10);
    expect(mean([10, null])).toBe(10);
  });
});
