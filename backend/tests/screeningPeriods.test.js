const { screeningPeriods, periodKeyOf } = require('../src/utils/screeningPeriods');

// Helper: one screening row. Dates are UTC so bucketing can't drift with the
// machine's timezone.
const s = (athleteId, assessedAt, extra = {}) => ({
  id: extra.id ?? Math.floor(Math.random() * 1e6),
  athleteId,
  assessedAt: new Date(assessedAt),
  totalScore: extra.totalScore ?? null,
  rom: extra.rom ?? null,
  stability: extra.stability ?? null,
  symmetry: extra.symmetry ?? null,
  exerciseRisks: extra.exerciseRisks ?? null,
  overallIndicator: extra.overallIndicator ?? null,
  overallBand: extra.overallBand ?? null,
  overrideBand: extra.overrideBand ?? null,
});

describe('periodKeyOf', () => {
  it('buckets by year, quarter and month', () => {
    const d = '2026-08-06T00:00:00Z';
    expect(periodKeyOf(d, 'year')).toEqual({ key: '2026', label: '2026' });
    expect(periodKeyOf(d, 'quarter')).toEqual({ key: '2026-Q3', label: 'Q3 2026' });
    expect(periodKeyOf(d, 'month')).toEqual({ key: '2026-08', label: 'Aug 2026' });
  });

  it('puts quarter boundaries in the right quarter', () => {
    expect(periodKeyOf('2026-01-01T00:00:00Z', 'quarter').key).toBe('2026-Q1');
    expect(periodKeyOf('2026-03-31T23:59:59Z', 'quarter').key).toBe('2026-Q1');
    expect(periodKeyOf('2026-04-01T00:00:00Z', 'quarter').key).toBe('2026-Q2');
    expect(periodKeyOf('2026-12-31T00:00:00Z', 'quarter').key).toBe('2026-Q4');
  });

  it('returns null for an unparseable date', () => {
    expect(periodKeyOf('not-a-date', 'month')).toBeNull();
  });

  it('sorts lexicographically within a grain', () => {
    const keys = ['2026-Q4', '2026-Q1', '2025-Q3', '2026-Q2'].sort();
    expect(keys).toEqual(['2025-Q3', '2026-Q1', '2026-Q2', '2026-Q4']);
  });
});

describe('screeningPeriods — throughput', () => {
  it('counts tests, distinct athletes and within-period retests separately', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-10T00:00:00Z'),
      s('A', '2026-02-10T00:00:00Z'), // same quarter → A is a within-period retest
      s('B', '2026-03-01T00:00:00Z'),
      s('C', '2026-05-01T00:00:00Z'), // next quarter
    ], { grain: 'quarter' });

    expect(periods.map((p) => p.key)).toEqual(['2026-Q1', '2026-Q2']);
    expect(periods[0]).toMatchObject({ tests: 3, athletes: 2, retestedWithin: 1 });
    expect(periods[1]).toMatchObject({ tests: 1, athletes: 1, retestedWithin: 0 });
  });

  it('returns periods in chronological order regardless of input order', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-07-01T00:00:00Z'),
      s('A', '2024-01-01T00:00:00Z'),
      s('A', '2025-01-01T00:00:00Z'),
    ], { grain: 'year' });
    expect(periods.map((p) => p.key)).toEqual(['2024', '2025', '2026']);
  });

  it('tallies bands, counting an override over the calculated band', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallBand: 'green' }),
      s('B', '2026-01-02T00:00:00Z', { overallBand: 'green', overrideBand: 'red' }),
      s('C', '2026-01-03T00:00:00Z', { overallBand: null }),
    ], { grain: 'year' });
    expect(periods[0].bands).toEqual({ green: 1, amber: 0, red: 1, none: 1 });
  });

  it('ignores rows with no assessment date', () => {
    const { periods, betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z'),
      { athleteId: 'A', assessedAt: null, id: 9 },
    ], { grain: 'year' });
    expect(periods[0].tests).toBe(1);
    expect(betweenTests.pairs).toBe(0);
  });

  it('handles an empty input', () => {
    const r = screeningPeriods([], { grain: 'month' });
    expect(r.periods).toEqual([]);
    expect(r.betweenTests.pairs).toBe(0);
    expect(r.betweenTests.intervalDays.median).toBeNull();
  });

  it('falls back to quarter for an unknown grain', () => {
    expect(screeningPeriods([], { grain: 'fortnight' }).grain).toBe('quarter');
  });
});

describe('screeningPeriods — direction of travel', () => {
  it('reads a rising indicator as improving and a falling one as declining', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 50 }),
      s('A', '2026-04-01T00:00:00Z', { overallIndicator: 60 }),
      s('A', '2026-07-01T00:00:00Z', { overallIndicator: 52 }),
    ], { grain: 'quarter' });

    expect(periods[0].deltas).toBeNull();       // nothing to compare the first to
    expect(periods[1].direction).toBe('improving');
    expect(periods[1].deltas.overallIndicator.delta).toBe(10);
    expect(periods[2].direction).toBe('declining');
    expect(periods[2].deltas.overallIndicator.delta).toBe(-8);
  });

  it('treats a move inside the noise band as steady', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 50 }),
      s('A', '2026-04-01T00:00:00Z', { overallIndicator: 51 }),
    ], { grain: 'quarter', noise: 2 });
    expect(periods[1].direction).toBe('steady');
  });

  it('inverts direction for exerciseRisks, where lower is better', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { exerciseRisks: 25 }),
      s('A', '2026-04-01T00:00:00Z', { exerciseRisks: 15 }),
    ], { grain: 'quarter' });
    const d = periods[1].deltas.exerciseRisks;
    expect(d.delta).toBe(-10);
    expect(d.higherBetter).toBe(false);
    expect(d.direction).toBe('improving'); // risk went DOWN, which is better
  });

  it('compares against the previous period present, skipping empty calendar gaps', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 40 }),
      s('A', '2026-10-01T00:00:00Z', { overallIndicator: 50 }), // Q4, Q2/Q3 absent
    ], { grain: 'quarter' });
    expect(periods.map((p) => p.key)).toEqual(['2026-Q1', '2026-Q4']);
    expect(periods[1].deltas.overallIndicator.delta).toBe(10);
  });

  it('reports a null delta when a score is missing on either side', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { totalScore: null }),
      s('A', '2026-04-01T00:00:00Z', { totalScore: 80 }),
    ], { grain: 'quarter' });
    expect(periods[1].deltas.totalScore.delta).toBeNull();
    expect(periods[1].deltas.totalScore.direction).toBeNull();
  });

  it('averages a period over all its rows, not just the last', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { totalScore: 60 }),
      s('B', '2026-01-02T00:00:00Z', { totalScore: 80 }),
    ], { grain: 'year' });
    expect(periods[0].averages.totalScore).toBe(70);
  });
});

describe('screeningPeriods — between tests', () => {
  it('pairs every consecutive test, not only the latest two', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 40 }),
      s('A', '2026-02-01T00:00:00Z', { overallIndicator: 50 }),
      s('A', '2026-03-01T00:00:00Z', { overallIndicator: 60 }),
    ], { grain: 'month' });
    expect(betweenTests.athletesWithRetest).toBe(1);
    expect(betweenTests.pairs).toBe(2);
    expect(betweenTests.improved).toBe(2);
  });

  it('excludes athletes with a single test', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z'),
      s('B', '2026-01-01T00:00:00Z'),
    ], { grain: 'month' });
    expect(betweenTests.athletesWithRetest).toBe(0);
    expect(betweenTests.pairs).toBe(0);
  });

  it('measures the retest interval in days', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z'),
      s('A', '2026-01-31T00:00:00Z'), // 30 days
      s('B', '2026-01-01T00:00:00Z'),
      s('B', '2026-03-02T00:00:00Z'), // 60 days
    ], { grain: 'month' });
    expect(betweenTests.intervalDays.min).toBe(30);
    expect(betweenTests.intervalDays.max).toBe(60);
    expect(betweenTests.intervalDays.median).toBe(45);
  });

  it('pairs in date order even when the input is shuffled', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-03-01T00:00:00Z', { overallIndicator: 60 }),
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 40 }),
    ], { grain: 'month' });
    // Chronological pairing gives 40 → 60, an improvement, not a decline.
    expect(betweenTests.improved).toBe(1);
    expect(betweenTests.declined).toBe(0);
    expect(betweenTests.deltas.find((d) => d.key === 'overallIndicator').avgDelta).toBe(20);
  });

  it('counts band moves, treating a better band as an improvement', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallBand: 'red' }),
      s('A', '2026-02-01T00:00:00Z', { overallBand: 'amber' }),
      s('B', '2026-01-01T00:00:00Z', { overallBand: 'green' }),
      s('B', '2026-02-01T00:00:00Z', { overallBand: 'red' }),
      s('C', '2026-01-01T00:00:00Z', { overallBand: 'green' }),
      s('C', '2026-02-01T00:00:00Z', { overallBand: 'green' }),
    ], { grain: 'month' });
    expect(betweenTests.bandMoves).toEqual({ better: 1, worse: 1, same: 1 });
  });

  it('averages deltas per score with the right orientation', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { rom: 70, exerciseRisks: 20 }),
      s('A', '2026-02-01T00:00:00Z', { rom: 80, exerciseRisks: 14 }),
    ], { grain: 'month' });
    const rom = betweenTests.deltas.find((d) => d.key === 'rom');
    const risk = betweenTests.deltas.find((d) => d.key === 'exerciseRisks');
    expect(rom).toMatchObject({ avgDelta: 10, higherBetter: true, direction: 'improving' });
    expect(risk).toMatchObject({ avgDelta: -6, higherBetter: false, direction: 'improving' });
  });
});
