// The band vocabulary (utils/bands.js) — one definition for "which band is
// worse", "what do we call it", and "which band actually applies".
//
// Worth its own suite because every one of its failure modes is silent. A
// divergent BAND_RANK makes "worse than" disagree between the alert threshold and
// the period comparison, so an athlete is flagged in one place and not the other.
// A backwards effectiveBand ignores every clinical override and still returns a
// perfectly valid band. Nothing throws; the numbers are just wrong.

const {
  BAND_RANK, BAND_LABEL, effectiveBand, atLeastAsBad,
} = require('../src/utils/bands');

describe('BAND_RANK', () => {
  test('orders green < amber < red', () => {
    expect(BAND_RANK.green).toBeLessThan(BAND_RANK.amber);
    expect(BAND_RANK.amber).toBeLessThan(BAND_RANK.red);
  });

  test('covers exactly the three Screening.overallBand enum values', () => {
    // A fourth band added to the model without being ranked here would compare as
    // undefined and silently fail every threshold test.
    expect(Object.keys(BAND_RANK).sort()).toEqual(['amber', 'green', 'red']);
  });
});

describe('BAND_LABEL', () => {
  test('names the two bands that get reported to a human', () => {
    expect(BAND_LABEL.amber).toBe('Needs attention');
    expect(BAND_LABEL.red).toBe('Immediate assessment');
  });
});

describe('effectiveBand', () => {
  test('a clinician override beats the computed band', () => {
    // The one expression in this repo that could be written backwards and still
    // look right. Backwards, it ignores every override ever recorded.
    expect(effectiveBand({ overallBand: 'green', overrideBand: 'red' })).toBe('red');
    expect(effectiveBand({ overallBand: 'red', overrideBand: 'green' })).toBe('green');
  });

  test('falls back to the computed band when there is no override', () => {
    expect(effectiveBand({ overallBand: 'amber', overrideBand: null })).toBe('amber');
    expect(effectiveBand({ overallBand: 'amber' })).toBe('amber');
    expect(effectiveBand({ overallBand: 'amber', overrideBand: '' })).toBe('amber');
  });

  test('returns null rather than undefined when there is no band at all', () => {
    // Callers do `effectiveBand(s) || "none"` and index objects with the result;
    // null keeps that predictable for an athlete in a cohort too small to score.
    expect(effectiveBand({})).toBeNull();
    expect(effectiveBand({ overallBand: null, overrideBand: null })).toBeNull();
  });

  test('is null-safe on a missing screening', () => {
    // The inline `s.overrideBand || s.overallBand` it replaced threw here.
    expect(effectiveBand(null)).toBeNull();
    expect(effectiveBand(undefined)).toBeNull();
  });
});

describe('atLeastAsBad', () => {
  test('true at the threshold and above it', () => {
    expect(atLeastAsBad('amber', 'amber')).toBe(true);
    expect(atLeastAsBad('red', 'amber')).toBe(true);
    expect(atLeastAsBad('red', 'red')).toBe(true);
  });

  test('false below the threshold', () => {
    expect(atLeastAsBad('green', 'amber')).toBe(false);
    expect(atLeastAsBad('amber', 'red')).toBe(false);
  });

  test('an unknown or absent band is never "bad enough"', () => {
    // An unranked band must not alert. Erring the other way would mail the whole
    // medical team about every athlete whose band failed to compute.
    expect(atLeastAsBad(null, 'amber')).toBe(false);
    expect(atLeastAsBad(undefined, 'amber')).toBe(false);
    expect(atLeastAsBad('purple', 'amber')).toBe(false);
  });

  test('an unknown threshold does not silently pass everything', () => {
    expect(atLeastAsBad('green', 'nonsense')).toBe(false);
  });
});
