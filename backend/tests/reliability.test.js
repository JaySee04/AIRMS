const { reliability, pairedDifferences, sd } = require('../src/utils/reliability');

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
