// Overall-indicator escalation banding, with focus on the active-injury factor
// that reconnects injury logging (Module 2) to the score. `activeInjuries` is
// the count of SIGNIFICANT active injuries (gated to Moderate/Severe or Chronic
// in recomputeIndicators); computeIndicator just consumes the count. Models are
// stubbed so the pure function can be exercised without a database.
jest.mock('../src/models', () => ({ Screening: {}, CohortThreshold: {}, Injury: {} }));

const { computeIndicator, compositeZ, zToScore, effectiveK, belongsToCohort } = require('../src/utils/overallIndicator');

// A screening whose oriented components sit exactly on the cohort mean → z 0.
const SCREENING = {
  totalScore: 70, rom: 80, stability: 78, symmetry: 90,
  neckInjuryRisk: 10, shoulderInjuryRisk: 10, scoliosis: 10,
  lumbarPelvisInjury: 10, jointPain: 10, kneeInjuryRisk: 10, ankleInjuryRisk: 10,
};
// mean == the screening's oriented value, sd 5 → every component z = 0.
const STATS_ON_MEAN = {
  totalScore: { mean: 70, sd: 5 }, rom: { mean: 80, sd: 5 }, stability: { mean: 78, sd: 5 },
  symmetry: { mean: 90, sd: 5 }, riskGood: { mean: -10, sd: 5 },
};
// means shifted up 5 → every component z = -1 → composite below the cohort mean.
const STATS_ABOVE = {
  totalScore: { mean: 75, sd: 5 }, rom: { mean: 85, sd: 5 }, stability: { mean: 83, sd: 5 },
  symmetry: { mean: 95, sd: 5 }, riskGood: { mean: -5, sd: 5 },
};

describe('active-injury floor', () => {
  test('a screening-clean athlete with no injury is green', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 0);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('a significant active injury floors a green athlete at amber', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 1);
    expect(r.band).toBe('amber');
    // The floor is NOT a stacking escalation — the count stays screening-only.
    expect(r.escalations).toBe(0);
    expect(r.factors.some((f) => /significant active injur/.test(f))).toBe(true);
  });

  test('the injury floor never by itself creates red — below-mean + injury stays amber', () => {
    const r = computeIndicator(SCREENING, STATS_ABOVE, null, {}, 1);
    expect(r.escalations).toBe(1);        // below cohort mean (screening)
    expect(r.band).toBe('amber');         // floor holds, does not stack to red
    expect(r.factors.some((f) => /below cohort average/.test(f))).toBe(true);
    expect(r.factors.some((f) => /significant active injur/.test(f))).toBe(true);
  });

  test('red still comes from two screening escalations, injury or not', () => {
    // below-mean + bottom-k → 2 escalations → red, injury present or absent.
    const rank = { rank: 1, total: 10, k: 2 };
    expect(computeIndicator(SCREENING, STATS_ABOVE, rank, {}, 0).band).toBe('red');
    expect(computeIndicator(SCREENING, STATS_ABOVE, rank, {}, 1).band).toBe('red');
  });

  test('the toggle disables the floor (back to the pure cohort score)', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, { escalation_injury: false }, 3);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('plural vs singular wording', () => {
    expect(computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 1).factors.find((f) => /injur/.test(f))).toMatch(/1 significant active injury/);
    expect(computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 2).factors.find((f) => /injur/.test(f))).toMatch(/2 significant active injuries/);
  });
});

describe('per-indicator escalation (Elevated AND peer-outlier)', () => {
  // Isolate the per-indicator rule from the below-mean / bottom-k factors.
  const base = { escalation_below_mean: false, escalation_bottom_k: false };
  const withKnee = (kneeStat) => ({ ...STATS_ON_MEAN, kneeInjuryRisk: kneeStat });
  const scr = (knee) => ({ ...SCREENING, kneeInjuryRisk: knee });

  test('fires when an indicator is Elevated AND a clear peer-outlier', () => {
    // knee 30 (> 25 Elevated); cohort mean 20 sd 5 → z = 2.0 ≥ 1.5
    const r = computeIndicator(scr(30), withKnee({ mean: 20, sd: 5 }), null, base, 0);
    expect(r.band).toBe('amber');
    expect(r.escalations).toBe(1);
    expect(r.factors.some((f) => /Knee 30/.test(f) && /over threshold/.test(f))).toBe(true);
  });

  test('does NOT fire when Elevated but not an outlier', () => {
    // knee 30 (> 25) but cohort mean 28 sd 5 → z = 0.4 < 1.5
    const r = computeIndicator(scr(30), withKnee({ mean: 28, sd: 5 }), null, base, 0);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('does NOT fire when a peer-outlier but not Elevated', () => {
    // knee 20 (< 25, not Elevated) even though z = (20-5)/5 = 3
    const r = computeIndicator(scr(20), withKnee({ mean: 5, sd: 5 }), null, base, 0);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('default z-cutoff is 1.5 not 1.0 (guards the fallback fix)', () => {
    // knee 30; cohort mean 24 sd 5 → z = 1.2 (between 1.0 and 1.5)
    expect(computeIndicator(scr(30), withKnee({ mean: 24, sd: 5 }), null, base, 0).escalations).toBe(0);
    // the same reading DOES escalate under an explicit 1.0 cutoff
    expect(computeIndicator(scr(30), withKnee({ mean: 24, sd: 5 }), null, { ...base, escalation_indicator_z: 1.0 }, 0).escalations).toBe(1);
  });
});

describe('score mapping, bottom-k cap, cohort membership', () => {
  test('zToScore: 0 → 50, ±3 SD → 0/100, clamped beyond', () => {
    expect(zToScore(0)).toBe(50);
    expect(zToScore(3)).toBe(100);
    expect(zToScore(-3)).toBe(0);
    expect(zToScore(6)).toBe(100);
    expect(zToScore(-6)).toBe(0);
    expect(zToScore(1)).toBe(67); // 50 + 1·(50/3) = 66.67 → 67
  });

  test('effectiveK caps at 20% of the cohort but never below 1', () => {
    expect(effectiveK(30, { bottom_k: 3 })).toBe(3); // floor(6) capped by k=3
    expect(effectiveK(10, { bottom_k: 3 })).toBe(2); // floor(2)
    expect(effectiveK(5, { bottom_k: 3 })).toBe(1);  // floor(1)
    expect(effectiveK(3, { bottom_k: 3 })).toBe(1);  // floor(0.6)=0 → min 1
    expect(effectiveK(0, { bottom_k: 3 })).toBe(3);  // unknown size → raw k
  });

  test('belongsToCohort matches by the tier the cohort represents', () => {
    const a = { sport: 'Badminton', program: 'PODIUM', gender: 'Male' };
    expect(belongsToCohort(a, 'all')).toBe(true);
    expect(belongsToCohort(a, 's|Badminton')).toBe(true);
    expect(belongsToCohort(a, 's|Swimming')).toBe(false);
    expect(belongsToCohort(a, 'sg|Badminton|Male')).toBe(true);
    expect(belongsToCohort(a, 'sg|Badminton|Female')).toBe(false);
    expect(belongsToCohort(a, 'spg|Badminton|PODIUM|Male')).toBe(true);
    expect(belongsToCohort(a, 'spg|Badminton|PELAPIS|Male')).toBe(false);
  });

  test('compositeZ averages the component z-scores (null when uncomparable)', () => {
    expect(compositeZ(SCREENING, STATS_ON_MEAN)).toBe(0);
    expect(compositeZ(SCREENING, STATS_ABOVE)).toBe(-1);
    expect(compositeZ(SCREENING, null)).toBeNull();
  });
});
