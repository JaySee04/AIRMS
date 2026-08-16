import { ordinal, percentileFromRank, percentilePhrase } from './rank';

describe('percentileFromRank', () => {
  it('places the middle of the group near the 50th percentile', () => {
    expect(percentileFromRank(29, 58)).toBe(49);
    expect(percentileFromRank(30, 58)).toBe(51);
  });

  // The mid-rank convention exists so the extremes stay inside the scale: an
  // athlete is never "better than 100% of a group they are in".
  it('never returns 0 or 100 for a real member of the group', () => {
    expect(percentileFromRank(1, 58)).toBe(1);
    expect(percentileFromRank(58, 58)).toBe(99);
    expect(percentileFromRank(1, 2)).toBe(25);
    expect(percentileFromRank(2, 2)).toBe(75);
  });

  it('reads the same standing identically across group sizes', () => {
    // Bottom quarter either way; the raw ranks look nothing alike.
    expect(percentileFromRank(12, 58)).toBeCloseTo(percentileFromRank(5, 24) as number, -1);
  });

  it('declines when there is no group to be placed in', () => {
    expect(percentileFromRank(1, 1)).toBeNull();
    expect(percentileFromRank(null, 58)).toBeNull();
    expect(percentileFromRank(12, null)).toBeNull();
    expect(percentileFromRank(undefined, undefined)).toBeNull();
  });

  it('rejects a rank outside the group', () => {
    expect(percentileFromRank(0, 58)).toBeNull();
    expect(percentileFromRank(59, 58)).toBeNull();
  });
});

describe('ordinal', () => {
  it('handles the ordinary cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(92)).toBe('92nd');
  });

  it('handles the teens, which are the ones that get written wrong', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('percentilePhrase', () => {
  it('builds the sentence with the caller\'s possessive', () => {
    expect(percentilePhrase(12, 58)).toBe('20th percentile of their group');
    expect(percentilePhrase(12, 58, 'your')).toBe('20th percentile of your group');
  });

  it('returns null rather than a broken sentence', () => {
    expect(percentilePhrase(1, 1)).toBeNull();
  });
});
