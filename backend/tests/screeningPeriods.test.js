const { screeningPeriods, seasonality, periodKeyOf } = require('../src/utils/screeningPeriods');

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

  // Boundaries are decided in the INSTITUTION's calendar (INSTITUTION_TZ,
  // Asia/Kuala_Lumpur), not UTC. These cases used to assert the UTC answer,
  // which is why two of them changed when the frame did: an instant late on
  // 31 March UTC is already 1 April at ISN, and for "which quarter is the risky
  // one" the answer that matters is the one on the wall in Bukit Jalil.
  it('puts quarter boundaries in the right quarter, in the ISN calendar', () => {
    // 08:00 MYT on 1 Jan — unambiguously Q1 in both frames.
    expect(periodKeyOf('2026-01-01T00:00:00Z', 'quarter').key).toBe('2026-Q1');
    // 23:59 UTC on 31 Mar is 07:59 on 1 Apr in KL, so it belongs to Q2.
    expect(periodKeyOf('2026-03-31T23:59:59Z', 'quarter').key).toBe('2026-Q2');
    // The last instant that is still Q1 at ISN: 15:59:59 UTC = 23:59:59 MYT.
    expect(periodKeyOf('2026-03-31T15:59:59Z', 'quarter').key).toBe('2026-Q1');
    // And the first that is Q2 there.
    expect(periodKeyOf('2026-03-31T16:00:00Z', 'quarter').key).toBe('2026-Q2');
    expect(periodKeyOf('2026-04-01T00:00:00Z', 'quarter').key).toBe('2026-Q2');
    expect(periodKeyOf('2026-12-31T00:00:00Z', 'quarter').key).toBe('2026-Q4');
  });

  it('buckets a morning screening on the day it happened at ISN', () => {
    // The realistic case, and the one the old UTC framing got wrong: an
    // institute screens athletes early, and 07:00 MYT on 1 August is 23:00 UTC
    // on 31 July. It belongs to August.
    expect(periodKeyOf('2025-07-31T23:00:00Z', 'month').key).toBe('2025-08');
    expect(periodKeyOf('2025-07-31T23:00:00Z', 'quarter').key).toBe('2025-Q3');
  });

  it('does not depend on the timezone the SERVER happens to run in', () => {
    // Vercel runs UTC; this laptop runs MYT. The bucket must not move between
    // them, which is the whole reason the zone is named rather than implied.
    const iso = '2025-07-31T23:00:00Z';
    const prev = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const a = periodKeyOf(iso, 'month').key;
      process.env.TZ = 'America/New_York';
      const b = periodKeyOf(iso, 'month').key;
      expect(a).toBe(b);
      expect(a).toBe('2025-08');
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
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

  // CHANGED 2026-08-11. This used to assert that empty calendar periods were
  // SKIPPED and that Q4 compared straight back to Q1. The axis is now continuous:
  // an unscreened quarter is a period with zero tests, not an absence.
  //
  // For a screening programme that is the more useful reading — "we tested nobody
  // in Q2 or Q3" is the finding, and a discrete axis drew Q1 and Q4 side by side
  // as though they were consecutive quarters.
  it('keeps empty calendar periods on the axis instead of skipping them', () => {
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 40 }),
      s('A', '2026-10-01T00:00:00Z', { overallIndicator: 50 }), // Q4; nothing in Q2/Q3
    ], { grain: 'quarter' });
    expect(periods.map((p) => p.key)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(periods[1].tests).toBe(0);
    expect(periods[1].athletes).toBe(0);
  });

  it('does not compare a period against an EMPTY one across a gap', () => {
    // Q4's previous period is now the empty Q3, whose averages are null — so it
    // reports no change rather than quietly measuring against Q1 three quarters
    // earlier and presenting that as a quarter-on-quarter move.
    const { periods } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { overallIndicator: 40 }),
      s('A', '2026-10-01T00:00:00Z', { overallIndicator: 50 }),
    ], { grain: 'quarter' });
    expect(periods[3].deltas.overallIndicator.delta).toBeNull();
  });

  it('nothing is invented before the first screening or after the last', () => {
    // A gap means "we ran the programme and tested nobody". Padding earlier would
    // assert periods before the programme existed.
    const { periods } = screeningPeriods([
      s('A', '2026-04-01T00:00:00Z', { overallIndicator: 40 }),
      s('A', '2026-06-01T00:00:00Z', { overallIndicator: 50 }),
    ], { grain: 'month' });
    expect(periods.map((p) => p.key)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('grainCounts says how many periods each grain would draw', () => {
    // Drives the grain switcher: a grain that yields one period is not a trend,
    // and the UI should say so before the user picks it.
    const rows = [
      s('A', '2026-04-23T00:00:00Z', { overallIndicator: 40 }),
      s('B', '2026-08-03T00:00:00Z', { overallIndicator: 50 }),
    ];
    expect(screeningPeriods(rows, { grain: 'month' }).grainCounts)
      .toEqual({ month: 5, quarter: 2, year: 1 });
    expect(screeningPeriods([], { grain: 'month' }).grainCounts)
      .toEqual({ month: 0, quarter: 0, year: 0 });
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

  // An average of zero has two causes that mean opposite things, and the panel
  // used to render both as "→ 0". These two cases pin the difference.
  it('separates a score nobody moved from one whose moves cancelled out', () => {
    const { betweenTests } = screeningPeriods([
      // rom never changes; stability moves +10 and -10, averaging to zero.
      s('A', '2026-01-01T00:00:00Z', { rom: 70, stability: 60 }),
      s('A', '2026-02-01T00:00:00Z', { rom: 70, stability: 70 }),
      s('B', '2026-01-01T00:00:00Z', { rom: 70, stability: 70 }),
      s('B', '2026-02-01T00:00:00Z', { rom: 70, stability: 60 }),
    ], { grain: 'month' });

    const rom = betweenTests.deltas.find((d) => d.key === 'rom');
    const stability = betweenTests.deltas.find((d) => d.key === 'stability');

    // Identical averages...
    expect(rom.avgDelta).toBe(0);
    expect(stability.avgDelta).toBe(0);
    // ...telling completely different stories.
    expect(rom).toMatchObject({ movedPairs: 0, comparedPairs: 2 });
    expect(stability).toMatchObject({ movedPairs: 2, comparedPairs: 2 });
  });

  it('does not count a pair as compared when either reading is missing', () => {
    const { betweenTests } = screeningPeriods([
      s('A', '2026-01-01T00:00:00Z', { rom: null }),
      s('A', '2026-02-01T00:00:00Z', { rom: 80 }),
    ], { grain: 'month' });
    const rom = betweenTests.deltas.find((d) => d.key === 'rom');
    // No baseline to measure against — not a pair that "did not move".
    expect(rom).toMatchObject({ comparedPairs: 0, movedPairs: 0, avgDelta: null });
  });
});

describe('seasonality — which quarter carries the risk', () => {
  const bucket = (out, key) => out.buckets.find((b) => b.key === key);

  it('pools the same quarter across years and discards the year', () => {
    const out = seasonality([
      s('a', '2025-08-10', { overallBand: 'red' }),
      s('b', '2026-07-02', { overallBand: 'amber' }),
      s('c', '2026-02-14', { overallBand: 'green' }),
    ]);
    expect(bucket(out, 'Q3').tests).toBe(2);
    expect(bucket(out, 'Q3').years).toBe(2);
    expect(bucket(out, 'Q1').tests).toBe(1);
    expect(out.yearsCovered).toBe(2);
    expect(out.years).toEqual([2025, 2026]);
  });

  it('always returns four quarters, so an unscreened quarter is a visible gap', () => {
    const out = seasonality([s('a', '2026-02-01', { overallBand: 'green' })]);
    expect(out.buckets.map((b) => b.key)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(bucket(out, 'Q2').tests).toBe(0);
    expect(bucket(out, 'Q2').flaggedShare).toBeNull();
  });

  it('flagged is a SHARE, so a busy quarter does not outrank a bad one', () => {
    // Q1: 4 tests, 1 flagged (25%). Q3: 2 tests, 2 flagged (100%).
    // Ranking by count would name Q1; ranking by share names Q3, which is right.
    const out = seasonality([
      s('a', '2025-01-05', { overallBand: 'red' }), s('b', '2025-01-06', { overallBand: 'green' }),
      s('c', '2026-01-07', { overallBand: 'green' }), s('d', '2026-01-08', { overallBand: 'green' }),
      s('e', '2025-08-05', { overallBand: 'red' }), s('f', '2026-08-06', { overallBand: 'amber' }),
    ]);
    expect(bucket(out, 'Q1').flaggedShare).toBeCloseTo(0.25, 3);
    expect(bucket(out, 'Q3').flaggedShare).toBeCloseTo(1, 3);
    expect(out.worst).toBe('Q3');
  });

  it('a clinician override decides whether a screening counts as flagged', () => {
    const out = seasonality([
      s('a', '2025-08-01', { overallBand: 'green', overrideBand: 'red' }),
      s('b', '2026-08-01', { overallBand: 'green', overrideBand: 'red' }),
      s('c', '2025-02-01', { overallBand: 'green' }), s('d', '2026-02-01', { overallBand: 'green' }),
    ]);
    expect(bucket(out, 'Q3').flaggedShare).toBeCloseTo(1, 3);
    expect(out.worst).toBe('Q3');
  });

  it('names no season from a single year, however lopsided the numbers', () => {
    // THE POINT OF THE FEATURE'S CAVEAT. Q3 is 100% flagged and Q1 is 0%, and it
    // still must not be reported as seasonal — one year cannot separate a season
    // from the quarter in which the weaker squads happened to be screened.
    const out = seasonality([
      s('a', '2026-08-01', { overallBand: 'red' }), s('b', '2026-08-02', { overallBand: 'red' }),
      s('c', '2026-02-01', { overallBand: 'green' }), s('d', '2026-02-02', { overallBand: 'green' }),
    ]);
    expect(out.yearsCovered).toBe(1);
    expect(out.sufficient).toBe(false);
    expect(out.worst).toBeNull();
    // The numbers are still computed — the report shows them under the caveat.
    expect(bucket(out, 'Q3').flaggedShare).toBeCloseTo(1, 3);
  });

  it('needs two quarters with data before naming one', () => {
    const out = seasonality([
      s('a', '2025-08-01', { overallBand: 'red' }),
      s('b', '2026-08-01', { overallBand: 'red' }),
    ]);
    expect(out.sufficient).toBe(true);
    expect(out.worst).toBeNull();
  });

  it('a margin inside the noise band is a coin toss, not a season', () => {
    // Q1 6/12 = 50.0%, Q3 7/12 ~ 58.3% — an 8.3pt gap clears the default noise of
    // 2, but not a noise of 10.
    const rows = [];
    for (let i = 0; i < 12; i += 1) {
      rows.push(s(`q1-${i}`, `${i % 2 ? 2025 : 2026}-01-1${i % 10}`, { overallBand: i < 6 ? 'red' : 'green' }));
      rows.push(s(`q3-${i}`, `${i % 2 ? 2025 : 2026}-08-1${i % 10}`, { overallBand: i < 7 ? 'red' : 'green' }));
    }
    expect(seasonality(rows).worst).toBe('Q3');
    expect(seasonality(rows, { noise: 10 }).worst).toBeNull();
  });

  it('ignores unparseable and missing dates instead of throwing', () => {
    const out = seasonality([
      s('a', '2026-02-01', { overallBand: 'green' }),
      { athleteId: 'b', assessedAt: 'not a date', overallBand: 'red' },
      { athleteId: 'c', overallBand: 'red' },
      null,
    ]);
    expect(out.buckets.reduce((n, b) => n + b.tests, 0)).toBe(1);
  });

  it('handles no data at all', () => {
    const out = seasonality([]);
    expect(out.yearsCovered).toBe(0);
    expect(out.sufficient).toBe(false);
    expect(out.worst).toBeNull();
    expect(out.buckets).toHaveLength(4);
  });

  it('month grain gives twelve slots in calendar order', () => {
    const out = seasonality([s('a', '2026-03-01', { overallBand: 'green' })], { grain: 'month' });
    expect(out.buckets).toHaveLength(12);
    expect(out.buckets[0].label).toBe('Jan');
    expect(out.buckets[2].tests).toBe(1);
  });

  it('is exposed on screeningPeriods at quarter grain whatever the caller asked for', () => {
    // A month-of-year split over ISN's volume is a dozen buckets of two or three
    // tests, which looks like a pattern and is not one.
    const out = screeningPeriods([s('a', '2026-03-01', { overallBand: 'green' })], { grain: 'month' });
    expect(out.seasonality.grain).toBe('quarter');
    expect(out.seasonality.buckets).toHaveLength(4);
  });
});

// A period answers two different questions, and the chart conflated them.
//
// `bands` counts SCREENINGS — seasonality ranks quarters by the share of flagged
// screenings and needs that. `athleteBands` counts ATHLETES, from each one's
// latest screening in the period, which is what "band" means everywhere else in
// AIRMS (latestScreeningsByAthlete). The column height is the athlete count, so
// only athleteBands sums to it.
describe('per-athlete band counts', () => {
  const mk = (athleteId, assessedAt, overallBand) => ({
    athleteId, assessedAt, overallBand, overrideBand: null, totalScore: 70,
  });

  it('counts an athlete ONCE per period, however often they were screened', () => {
    // Same athlete twice in one month, plus one other athlete.
    const out = periodsOf([
      mk('A', '2026-06-02', 'red'),
      mk('A', '2026-06-20', 'green'),
      mk('B', '2026-06-10', 'amber'),
    ]);
    const p = out[out.length - 1];
    expect(p.athletes).toBe(2);
    expect(p.tests).toBe(3);
    // Per screening: red + green + amber = 3. Per athlete: 2.
    expect(sum(p.bands)).toBe(3);
    expect(sum(p.athleteBands)).toBe(2);
    expect(sum(p.athleteBands)).toBe(p.athletes);
  });

  it('represents a re-screened athlete by their LATEST band in that period', () => {
    // A was red on the 2nd and green on the 20th; the period should say green.
    const out = periodsOf([mk('A', '2026-06-02', 'red'), mk('A', '2026-06-20', 'green')]);
    const p = out[out.length - 1];
    expect(p.athleteBands.green).toBe(1);
    expect(p.athleteBands.red).toBe(0);
  });

  it('leaves `bands` counting screenings, because seasonality depends on it', () => {
    const out = periodsOf([mk('A', '2026-06-02', 'red'), mk('A', '2026-06-20', 'red')]);
    const p = out[out.length - 1];
    expect(p.bands.red).toBe(2);
    expect(p.athleteBands.red).toBe(1);
  });

  function periodsOf(rows) { return screeningPeriods(rows, 'month').periods; }
  function sum(b) { return b.green + b.amber + b.red + b.none; }
});
