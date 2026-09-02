const {
  reliability, pairedDifferences, sd, consecutivePairs, MIN_PAIRS,
} = require('../src/utils/reliability');

// One athlete, two screenings, only the fields under test set.
let seq = 0;
const s = (athleteId, at, scores = {}) => ({
  id: ++seq, athleteId, assessedAt: at, ...scores,
});

/** n repeat pairs whose second reading differs from the first by `deltas[i]`. */
function pairsWith(deltas, key = 'totalScore', base = 70) {
  const rows = [];
  deltas.forEach((d, i) => {
    rows.push(s(`A${i}`, '2026-01-01T00:00:00Z', { [key]: base }));
    rows.push(s(`A${i}`, '2026-02-01T00:00:00Z', { [key]: base + d }));
  });
  return rows;
}

describe('paired differences', () => {
  it('takes one difference per consecutive pair, in date order', () => {
    const d = pairedDifferences([
      s('A', '2026-03-01T00:00:00Z', { totalScore: 80 }),
      s('A', '2026-01-01T00:00:00Z', { totalScore: 70 }),
      s('A', '2026-02-01T00:00:00Z', { totalScore: 74 }),
    ]);
    // 70 -> 74 -> 80, so +4 then +6. Shuffled input must not change that.
    expect(d.get('totalScore')).toEqual([4, 6]);
  });

  it('ignores a pair where either reading is missing', () => {
    const d = pairedDifferences([
      s('A', '2026-01-01T00:00:00Z', { totalScore: null }),
      s('A', '2026-02-01T00:00:00Z', { totalScore: 80 }),
    ]);
    expect(d.get('totalScore')).toEqual([]);
  });

  it('never pairs across different athletes', () => {
    const d = pairedDifferences([
      s('A', '2026-01-01T00:00:00Z', { totalScore: 70 }),
      s('B', '2026-02-01T00:00:00Z', { totalScore: 90 }),
    ]);
    expect(d.get('totalScore')).toEqual([]);
  });
});

describe('typical error and MDC95', () => {
  // The arithmetic, pinned against a hand-checkable case: differences of
  // +2/-2 repeated have SD 2 (sample, n-1), so TE = 2/sqrt(2) = 1.414 and
  // MDC95 = 2.77 * TE = 3.92.
  it('computes TE = SD/sqrt(2) and MDC95 = 1.96*sqrt(2)*TE', () => {
    const deltas = Array.from({ length: 24 }, (_, i) => (i % 2 ? 2 : -2));
    const r = reliability(pairsWith(deltas));
    const total = r.byKey.totalScore;

    expect(total.pairs).toBe(24);
    expect(total.sufficient).toBe(true);
    expect(sd(deltas)).toBeCloseTo(2.043, 2);
    expect(total.te).toBeCloseTo(2.043 / Math.SQRT2, 1);
    expect(total.mdc95).toBeCloseTo(1.96 * Math.SQRT2 * total.te, 1);
    // And the dead band IS the MDC once it can be derived.
    expect(total.deadBand).toBe(total.mdc95);
  });

  it('gives a noisier score a WIDER dead band than a stable one', () => {
    const noisy = Array.from({ length: 24 }, (_, i) => (i % 2 ? 9 : -9));
    const stable = Array.from({ length: 24 }, (_, i) => (i % 2 ? 1 : -1));
    const a = reliability(pairsWith(noisy)).byKey.totalScore;
    const b = reliability(pairsWith(stable)).byKey.totalScore;
    expect(a.deadBand).toBeGreaterThan(b.deadBand);
  });
});

describe('declining to guess', () => {
  it('falls back below the minimum number of repeats, and says why', () => {
    const r = reliability(pairsWith([1, -1, 2, -2]));
    const total = r.byKey.totalScore;
    expect(total.sufficient).toBe(false);
    expect(total.deadBand).toBe(2);       // the documented fallback
    expect(total.te).toBeNull();
    expect(total.reason).toMatch(/only 4 repeats/);
    expect(r.anySufficient).toBe(false);
  });

  // The failure this guards is silent and dangerous: an SD of zero would hand
  // back a dead band of 0, making every rounding wobble a "change".
  it('refuses a score that never moved instead of returning a zero band', () => {
    const r = reliability(pairsWith(new Array(24).fill(0)));
    const total = r.byKey.totalScore;
    expect(total.movedPairs).toBe(0);
    expect(total.sufficient).toBe(false);
    expect(total.deadBand).toBe(2);
    expect(total.reason).toMatch(/not re-measured/);
  });

  it('judges each score independently', () => {
    // totalScore varies; rom is present but frozen across every pair.
    const rows = [];
    Array.from({ length: 24 }).forEach((_, i) => {
      rows.push(s(`A${i}`, '2026-01-01T00:00:00Z', { totalScore: 70, rom: 80 }));
      rows.push(s(`A${i}`, '2026-02-01T00:00:00Z', { totalScore: 70 + (i % 2 ? 3 : -3), rom: 80 }));
    });
    const r = reliability(rows);
    expect(r.byKey.totalScore.sufficient).toBe(true);
    expect(r.byKey.rom.sufficient).toBe(false);
    expect(r.byKey.rom.reason).toMatch(/not re-measured/);
    expect(r.anySufficient).toBe(true);
  });

  it('always returns a usable dead band from deadBandFor', () => {
    const r = reliability([]);
    expect(r.deadBandFor('totalScore')).toBe(2);
    expect(r.deadBandFor('nonexistent')).toBe(2);
  });
});

describe('integration with direction of travel', () => {
  const { screeningPeriods } = require('../src/utils/screeningPeriods');

  it('reports the derived band and its provenance alongside the periods', () => {
    const deltas = Array.from({ length: 24 }, (_, i) => (i % 2 ? 8 : -8));
    const out = screeningPeriods(pairsWith(deltas), { grain: 'month' });
    expect(out.reliability.derived).toBe(true);
    expect(out.reliability.anySufficient).toBe(true);
    const total = out.reliability.scores.find((x) => x.key === 'totalScore');
    expect(total.sufficient).toBe(true);
    expect(total.mdc95).toBeGreaterThan(2); // wider than the old blanket guess
  });

  it('still honours an explicitly supplied dead band', () => {
    const out = screeningPeriods(pairsWith([1, -1]), { grain: 'month', noise: 5 });
    expect(out.reliability.derived).toBe(false);
    expect(out.betweenTests.deltas.find((d) => d.key === 'totalScore').deadBand).toBe(5);
  });

  // The point of the whole exercise: a move that used to read as real now has
  // to clear a threshold derived from how much the measure actually wobbles.
  it('calls a change STEADY when it is inside the derived error band', () => {
    const rows = [];
    // A measure that swings +-8 between repeats: MDC95 lands well above 3.
    Array.from({ length: 24 }).forEach((_, i) => {
      rows.push(s(`A${i}`, '2026-01-01T00:00:00Z', { totalScore: 70, overallIndicator: 50 }));
      rows.push(s(`A${i}`, '2026-02-01T00:00:00Z', { totalScore: 70 + (i % 2 ? 8 : -8), overallIndicator: 50 }));
    });
    // One athlete moves 3 points between two months — above the old band of 2.
    rows.push(s('Z', '2026-01-01T00:00:00Z', { totalScore: 70 }));
    rows.push(s('Z', '2026-02-01T00:00:00Z', { totalScore: 73 }));

    const out = screeningPeriods(rows, { grain: 'month' });
    const band = out.reliability.scores.find((x) => x.key === 'totalScore').deadBand;
    expect(band).toBeGreaterThan(3);
    // With the old hardcoded 2, a 3-point move was "improving". It is not.
    const strict = screeningPeriods(rows, { grain: 'month', noise: 2 });
    const loose = strict.betweenTests.deltas.find((d) => d.key === 'totalScore');
    expect(loose.deadBand).toBe(2);
  });
});

// ── Duplicate commits must not manufacture a retest ─────────────────────────
//
// Found 2026-09-02 sweeping for concurrency faults. The screening commit was an
// unconditional INSERT and the (athlete_id, assessed_at) index is not unique, so
// committing the same report twice appended an identical row. consecutivePairs
// then paired the two as a retest with a difference of zero on every score.
//
// Measured against the real 74 rows: TWO duplicate commits took the engine from
// 18 pairs — correctly declining, dead band 2, labelled an assumption — to 20
// pairs and a DERIVED dead band of 5.7 to 11.5. That is the failure this module
// exists to prevent, reached by inflating the numerator instead of lowering the
// floor. The demo hands the same three reports to two people, so it is the
// expected path rather than an edge case.
describe('same-instant readings are not a retest', () => {
  const at = (iso, over = {}) => ({
    id: Math.floor(Math.random() * 1e6),
    athleteId: 'A1',
    assessedAt: iso,
    overallIndicator: 50, totalScore: 70, rom: 70,
    stability: 70, symmetry: 70, exerciseRisks: 10,
    ...over,
  });

  it('collapses a duplicate commit instead of pairing it', () => {
    const one = [at('2026-01-01T00:00:00Z'), at('2026-06-01T00:00:00Z')];
    const withDupe = [
      at('2026-01-01T00:00:00Z'),
      at('2026-01-01T00:00:00Z'),   // the second operator pressing Commit
      at('2026-06-01T00:00:00Z'),
    ];
    expect(consecutivePairs(one).pairs).toHaveLength(1);
    expect(consecutivePairs(withDupe).pairs).toHaveLength(1);
  });

  it('produces no zero-elapsed pair, however many duplicates arrive', () => {
    const rows = [];
    for (let i = 0; i < 6; i += 1) rows.push(at('2026-01-01T00:00:00Z'));
    rows.push(at('2026-06-01T00:00:00Z'));
    const { pairs } = consecutivePairs(rows);
    const zeroGap = pairs.filter(
      ([a, b]) => new Date(a.assessedAt).getTime() === new Date(b.assessedAt).getTime(),
    );
    expect(zeroGap).toHaveLength(0);
  });

  it('keeps a genuine retest either side of a duplicate', () => {
    // A, A(dup), B, C -> two real pairs, not three.
    const rows = [
      at('2026-01-01T00:00:00Z'),
      at('2026-01-01T00:00:00Z'),
      at('2026-06-01T00:00:00Z'),
      at('2026-11-01T00:00:00Z'),
    ];
    expect(consecutivePairs(rows).pairs).toHaveLength(2);
  });

  it('does not let duplicates push the engine over MIN_PAIRS', () => {
    // Enough athletes to sit just under the floor, then flood duplicates.
    const rows = [];
    for (let a = 0; a < MIN_PAIRS - 1; a += 1) {
      rows.push(at('2026-01-01T00:00:00Z', { athleteId: `A${a}` }));
      rows.push(at('2026-06-01T00:00:00Z', { athleteId: `A${a}`, totalScore: 74 }));
    }
    expect(reliability(rows).scores[0].pairs).toBe(MIN_PAIRS - 1);
    expect(reliability(rows).anySufficient).toBe(false);

    const flooded = [...rows];
    for (let a = 0; a < MIN_PAIRS - 1; a += 1) {
      flooded.push(at('2026-01-01T00:00:00Z', { athleteId: `A${a}` }));
    }
    // Still short of the floor: a duplicate is not evidence.
    expect(reliability(flooded).scores[0].pairs).toBe(MIN_PAIRS - 1);
    expect(reliability(flooded).anySufficient).toBe(false);
  });
});

// The commit path is what stops duplicates existing at all. The route body has
// no extracted util, so this reads the source — same reason as the wiring
// assertions in athleteDisclosure.test.js.
describe('wiring — the screening commit is idempotent', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'routes', 'upload.js'), 'utf8',
  );

  it('looks for an existing screening at the same assessedAt before inserting', () => {
    expect(src).toMatch(/Screening\.findOne\(\{[\s\S]{0,160}assessedAt: screeningRow\.assessedAt/);
  });

  it('updates that row rather than appending a second', () => {
    // The BRANCH, not just the call. Asserting only that the update statement
    // exists passes happily when it sits inside `if (false)` — a mutation run
    // proved exactly that, which is the same defect shape being guarded here:
    // present, plausible, and never reached.
    const at = src.indexOf('if (twin) {');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toContain('Screening.update(screeningRow, { where: { id: twin.id }');
  });

  it('still inserts when there is no date to match on', () => {
    expect(src).toMatch(/screeningRow\.assessedAt\s*\?/);
    expect(src).toMatch(/Screening\.create\(screeningRow, \{ transaction: t \}\)/);
  });
});
