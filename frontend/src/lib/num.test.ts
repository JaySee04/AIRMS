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
import { toNum, numOr } from './num';

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
