// WHICH GROUND-TRUTH ROWS MAY FAIL, AND WHAT HAPPENS TO THE REST (§146)
//
// `verify:textlayer` could not fail on a wrong value. Its exit was
// `behaviourFailures ? 1 : (run.status === null ? 1 : 0)` — every non-null
// comparator status maps to 0 — so the ground-truth comparison was computed,
// printed in red, and thrown away. Measured by forcing `mobility` to 42: the
// comparator exited 1 naming the row, and the script exited 0.
//
// It was written that way to swallow the ONE row that fails by design (the
// Summary presence check, which this path declines on purpose), and it swallowed
// the whole verdict with it.
//
// The predicate cannot be exercised through the script — that needs a real PDF
// and a subprocess — which is exactly how an inverted one would hide: treat
// every row as expected and the original defect is back, silently, with the
// script still printing a reassuring note about the Summary.
const {
  EXPECTED_DECLINE, failedRows, unexpectedDivergences, shouldFail,
} = require('../scripts/lib/expectedDivergence');

// Shaped like the comparator's real table.
const row = (name, a, b, ok) => `  ${name}     ${a}     ${b}     ${ok ? '✓ PASS' : '✗ FAIL'}`;
const TABLE = [
  row('overall activity', '78', '78', true),
  row('mobility', '71', '71', true),
  row('summary read', 'non-empty', 'empty', false),
].join('\n');

describe('reading the comparator table', () => {
  test('finds the rows marked FAIL and nothing else', () => {
    expect(failedRows(TABLE)).toEqual(['summary read']);
  });

  test('does NOT mistake a passing row for a failing one', () => {
    // The first implementation used one regex with the `m` flag and matched a
    // row ending in "✓ PASS", reporting a clean report as broken. A check that
    // cries wolf is on its way to being ignored — which is how the defect this
    // file exists for survived in the first place.
    const allPass = [row('mobility', '71', '71', true), row('stability', '82', '82', true)].join('\n');
    expect(failedRows(allPass)).toEqual([]);
  });

  test('survives an empty or absent buffer', () => {
    expect(failedRows('')).toEqual([]);
    expect(failedRows(null)).toEqual([]);
    expect(failedRows(undefined)).toEqual([]);
  });

  test('reads several failing rows, in order', () => {
    const t = [
      row('mobility', '71', '42', false),
      row('summary read', 'non-empty', 'empty', false),
      row('stability', '82', '12', false),
    ].join('\n');
    expect(failedRows(t)).toEqual(['mobility', 'summary read', 'stability']);
  });
});

describe('which divergences are sanctioned', () => {
  test('the Summary decline alone is expected, when it really was declined', () => {
    expect(unexpectedDivergences(TABLE, true)).toEqual([]);
  });

  test('the Summary row is NOT excused when the Summary was read', () => {
    // If the path produced a Summary and the presence check still failed, that
    // is a real finding — mangled or truncated prose, §70's verbatim rule.
    expect(unexpectedDivergences(TABLE, false)).toEqual(['summary read']);
  });

  test('a wrong VALUE is never excused', () => {
    // The measured case. `mobility` is one of the three components Total Score
    // is the mean of, so this is a number a clinician acts on.
    const t = [row('mobility', '71', '42', false), row('summary read', 'non-empty', 'empty', false)].join('\n');
    expect(unexpectedDivergences(t, true)).toEqual(['mobility']);
  });

  test('EXPECTED_DECLINE names one row, not a category', () => {
    // A prefix or regex here would quietly excuse every row starting "summary".
    expect(EXPECTED_DECLINE).toBe('summary read');
    const t = row('summary verbatim', 'yes', 'no', false);
    expect(unexpectedDivergences(t, true)).toEqual(['summary verbatim']);
  });
});

describe('the verdict', () => {
  const base = { behaviourFailures: 0, stdout: TABLE, declined: true, status: 1 };

  test('a good report passes even though the comparator exited non-zero', () => {
    // The comparator exits 1 for the sanctioned Summary row. That must not fail
    // the run — and swallowing it is what broke everything else.
    expect(shouldFail(base)).toBe(false);
  });

  test('a wrong value fails, whatever the comparator exit code', () => {
    const t = [row('mobility', '71', '42', false)].join('\n');
    expect(shouldFail({ ...base, stdout: t })).toBe(true);
    expect(shouldFail({ ...base, stdout: t, status: 0 })).toBe(true);
  });

  test('a behaviour failure fails on its own', () => {
    expect(shouldFail({ ...base, behaviourFailures: 1 })).toBe(true);
  });

  test('a comparator that never ran is NOT clean (rule 2)', () => {
    expect(shouldFail({ ...base, status: null })).toBe(true);
    // Even with a spotless table: no output means nothing was measured.
    expect(shouldFail({ ...base, stdout: '', status: null })).toBe(true);
  });
});
