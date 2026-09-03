// The arithmetic behind the coach's headline percentages.
//
// It was wrong once, and the wrongness was invisible: three band tiles
// denominated over the whole squad while two of sixteen athletes had no
// screening, so they read 56% / 19% / 13% — 88% — and the stacked bar beneath
// stopped short of its track. Nothing said "two people are missing"; it looked
// like a rendering glitch (DESIGN_DECISIONS §44).
//
// So the properties asserted here are the ones a reader of the dashboard is
// entitled to assume: the percentages sum, the denominator is stated, and an
// athlete with no screening is never quietly folded into a band.
import {
  bandFor, readinessCounts, readinessBreakdown, READINESS_BANDS,
} from './readiness';

describe('bandFor', () => {
  it('maps the HoloMotion band to the coach vocabulary', () => {
    expect(bandFor('green')).toBe('full');
    expect(bandFor('amber')).toBe('observation');
    expect(bandFor('red')).toBe('restricted');
  });

  it('returns null for no screening — which is not a band', () => {
    expect(bandFor(null)).toBeNull();
    expect(bandFor(undefined)).toBeNull();
  });
});

describe('readinessCounts', () => {
  it('keeps the unscored apart from every band', () => {
    const c = readinessCounts(['full', 'full', 'observation', null, null, 'restricted']);
    expect(c).toEqual({ full: 2, observation: 1, restricted: 1, unscored: 2 });
  });

  it('counts an empty squad as all zeros rather than throwing', () => {
    expect(readinessCounts([])).toEqual({ full: 0, observation: 0, restricted: 0, unscored: 0 });
  });
});

describe('readinessBreakdown — the percentages sum', () => {
  // The exact squad the bug was measured on: 16 athletes, 9 / 3 / 2 banded and
  // 2 never screened.
  const SEEDED = [
    ...Array<'full'>(9).fill('full'),
    ...Array<'observation'>(3).fill('observation'),
    ...Array<'restricted'>(2).fill('restricted'),
    null, null,
  ];

  it('denominates over SCREENED athletes, not the whole squad', () => {
    const b = readinessBreakdown(SEEDED);
    expect(b.total).toBe(16);
    expect(b.scored).toBe(14);
    expect(b.counts.unscored).toBe(2);
    // 9/14 = 64%, not 9/16 = 56%.
    expect(b.share.full).toBe(64);
  });

  it('accounts for every SCREENED athlete — the property that was broken', () => {
    // The bug was a denominator, not rounding: the shares are over `scored`, so
    // the counts behind them add up to every screened athlete and to nobody
    // else. Twelve points of hidden people is the fault; a point of rounding
    // is not.
    const b = readinessBreakdown(SEEDED);
    const banded = READINESS_BANDS.reduce((a, k) => a + b.counts[k], 0);
    expect(banded).toBe(b.scored);
    expect(b.scored + b.counts.unscored).toBe(b.total);
    const sum = READINESS_BANDS.reduce((a, k) => a + b.share[k], 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  // Independent rounding lands within a point of 100. That is deliberate: see
  // readinessBreakdown's note on why forcing an exact total would make a tile
  // disagree with the count printed beneath it.
  it.each([
    [[1, 1, 1]],
    [[1, 1, 0]],
    [[2, 3, 5]],
    [[7, 7, 7]],
    [[1, 0, 2]],
    [[5, 5, 1]],
    [[3, 3, 3]],
    [[10, 3, 1]],
  ])('stays within a point of 100 for a %s split', (split) => {
    const [f, o, r] = split as number[];
    const bands = [
      ...Array<'full'>(f).fill('full'),
      ...Array<'observation'>(o).fill('observation'),
      ...Array<'restricted'>(r).fill('restricted'),
    ];
    const b = readinessBreakdown(bands);
    const sum = READINESS_BANDS.reduce((a, k) => a + b.share[k], 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
    // and every screened athlete is in exactly one band
    expect(READINESS_BANDS.reduce((a, k) => a + b.counts[k], 0)).toBe(b.scored);
  });

  it('never lets an unscored athlete raise or lower a band share', () => {
    const withNone = readinessBreakdown(['full', 'full', 'observation']);
    const withPlenty = readinessBreakdown(['full', 'full', 'observation', null, null, null, null]);
    expect(withPlenty.share).toEqual(withNone.share);
    expect(withPlenty.counts.unscored).toBe(4);
    expect(withPlenty.total).not.toBe(withNone.total);
  });

  it('reports zeros, not NaN, when nobody has been screened', () => {
    // 0/0 is the classic silent wrong answer: it renders as "NaN%" at best and
    // as an empty tile at worst.
    const b = readinessBreakdown([null, null, null]);
    expect(b.scored).toBe(0);
    expect(b.total).toBe(3);
    READINESS_BANDS.forEach((k) => {
      expect(b.share[k]).toBe(0);
      expect(Number.isFinite(b.share[k])).toBe(true);
    });
  });

  it('handles an empty squad', () => {
    const b = readinessBreakdown([]);
    expect(b).toMatchObject({ scored: 0, total: 0 });
    READINESS_BANDS.forEach((k) => expect(b.share[k]).toBe(0));
  });

  it('gives a single screened athlete 100% of their band', () => {
    const b = readinessBreakdown(['restricted', null]);
    expect(b.share.restricted).toBe(100);
    expect(b.share.full).toBe(0);
    expect(b.scored).toBe(1);
    expect(b.counts.unscored).toBe(1);
  });
});
