// Overall-indicator escalation banding — the cohort-normed HoloMotion indicator.
// Models are stubbed so the pure function runs without a database.
jest.mock('../src/models', () => ({ Screening: {}, CohortThreshold: {} }));

const {
  computeIndicator, compositeZ, zToScore, effectiveK, belongsToCohort, cohortDeltas, cohortLabelFor,
} = require('../src/utils/overallIndicator');

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

describe('screening escalation banding', () => {
  test('an athlete on the cohort mean is green (no escalation)', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {});
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('below the cohort mean is a single escalation → amber', () => {
    const r = computeIndicator(SCREENING, STATS_ABOVE, null, {});
    expect(r.escalations).toBe(1);
    expect(r.band).toBe('amber');
    expect(r.factors.some((f) => /below cohort average/.test(f))).toBe(true);
  });

  test('two screening escalations (below-mean + bottom-k) → red', () => {
    const rank = { rank: 1, total: 10, k: 2 };
    expect(computeIndicator(SCREENING, STATS_ABOVE, rank, {}).band).toBe('red');
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

// ── The below-mean CUTOFF (2026-08-11) ─────────────────────────────────────
// This rule was `z < 0`, which flags half of every cohort by construction: 27 of
// 58 seeded athletes tripped it and 12 of the 14 ambers rested on it alone, one
// at z = -0.163. These tests pin the boundary so it cannot silently revert to a
// sign test.
describe('below-mean escalation uses a cutoff, not a sign test', () => {
  // means shifted so every component z is exactly -0.3 → composite -0.3.
  const statsAtZ = (z) => ({
    totalScore: { mean: 70 - z * 5, sd: 5 }, rom: { mean: 80 - z * 5, sd: 5 },
    stability: { mean: 78 - z * 5, sd: 5 }, symmetry: { mean: 90 - z * 5, sd: 5 },
    riskGood: { mean: -10 - z * 5, sd: 5 },
  });

  it('does NOT escalate an athlete a hair below the mean', () => {
    const r = computeIndicator(SCREENING, statsAtZ(-0.3), null, {});
    expect(r.z).toBeCloseTo(-0.3, 2);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  it('escalates once past the cutoff', () => {
    const r = computeIndicator(SCREENING, statsAtZ(-0.8), null, {});
    expect(r.escalations).toBe(1);
    expect(r.band).toBe('amber');
  });

  it('the boundary itself does not escalate (strictly below)', () => {
    expect(computeIndicator(SCREENING, statsAtZ(-0.5), null, {}).escalations).toBe(0);
  });

  it('the cutoff is admin-configurable', () => {
    const at = statsAtZ(-0.3);
    expect(computeIndicator(SCREENING, at, null, { escalation_below_mean_z: -0.1 }).escalations).toBe(1);
    expect(computeIndicator(SCREENING, at, null, { escalation_below_mean_z: -2 }).escalations).toBe(0);
  });

  it('names the component carrying the escalation, not just "below average"', () => {
    // ROM 30 SD below everything else → it should be the one named.
    const stats = { ...statsAtZ(-0.8), rom: { mean: 95, sd: 5 } };
    const r = computeIndicator(SCREENING, stats, null, {});
    expect(r.factors.some((f) => /ROM/.test(f))).toBe(true);
  });
});

describe('cohortDeltas', () => {
  it('reports value, group mean and an oriented signed gap per component', () => {
    const d = cohortDeltas(SCREENING, STATS_ABOVE);
    const rom = d.find((x) => x.key === 'rom');
    expect(rom).toMatchObject({ label: 'ROM', value: 80, mean: 85, delta: -5, z: -1 });
  });

  it('un-negates the two components stored inverted, so a clinician sees real numbers', () => {
    // riskGood is stored as -(mean risk) so that higher = better for scoring. A
    // panel showing an injury-risk mean of -10 to a clinician would be nonsense.
    const d = cohortDeltas(SCREENING, STATS_ON_MEAN);
    const risk = d.find((x) => x.key === 'riskGood');
    expect(risk.value).toBe(10);
    expect(risk.mean).toBe(10);
    expect(risk.lowerIsBetter).toBe(true);
  });

  it('keeps the sign ORIENTED: positive is better on every row', () => {
    // Cohort mean risk 15 (stored -15), athlete 10 (stored -10) → the athlete is
    // BETTER, so the delta must be POSITIVE even though the raw value is lower.
    const d = cohortDeltas(SCREENING, { ...STATS_ON_MEAN, riskGood: { mean: -15, sd: 5 } });
    expect(d.find((x) => x.key === 'riskGood').delta).toBeGreaterThan(0);
  });

  it('skips components with no cohort stat and returns [] with no stats at all', () => {
    expect(cohortDeltas(SCREENING, null)).toEqual([]);
    const d = cohortDeltas(SCREENING, { rom: { mean: 80, sd: 5 } });
    expect(d.map((x) => x.key)).toEqual(['rom']);
  });
});

describe('reasons against assessment', () => {
  it('names the components better than the group', () => {
    const r = computeIndicator(SCREENING, { ...STATS_ON_MEAN, stability: { mean: 70, sd: 5 } }, null, {});
    expect(r.reasonsAgainst.some((x) => /Stability/.test(x))).toBe(true);
  });

  it('says "better than", never "above" - the two inverted rows make "above" false', () => {
    // Cohort mean risk 20 (stored -20), athlete 10: the athlete's RAW value is
    // lower, which is better. "Injury risk is above the group" would be a lie.
    const r = computeIndicator(SCREENING, { ...STATS_ON_MEAN, riskGood: { mean: -20, sd: 5 } }, null, {});
    const line = r.reasonsAgainst.find((x) => /Injury risk/.test(x));
    expect(line).toBeDefined();
    expect(line).toMatch(/better than the group/);
    expect(line).not.toMatch(/above the group/);
  });

  it('states when no exercise-risk indicator is at or over the threshold', () => {
    // Every risk in SCREENING is 10, well under 25.
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {});
    expect(r.reasonsAgainst.some((x) => /No exercise-risk indicator/.test(x))).toBe(true);
  });

  it('does NOT claim that when an indicator IS over the threshold', () => {
    const r = computeIndicator({ ...SCREENING, ankleInjuryRisk: 30 }, STATS_ON_MEAN, null, {});
    expect(r.reasonsAgainst.some((x) => /No exercise-risk indicator/.test(x))).toBe(false);
  });

  it('is empty rather than undefined when a cohort cannot score the athlete', () => {
    const r = computeIndicator(SCREENING, null, null, {});
    expect(r.reasonsAgainst).toEqual([]);
    expect(r.deltas).toEqual([]);
  });
});

describe('cohortLabelFor', () => {
  it('turns a pipe-delimited cohort id into something a clinician reads', () => {
    expect(cohortLabelFor('sg|Badminton|Male')).toBe('Badminton · Male');
    expect(cohortLabelFor('spg|Badminton|PODIUM|Male')).toBe('Badminton · PODIUM · Male');
    expect(cohortLabelFor('spgd|Athletics|PODIUM|Female|100m')).toBe('Athletics · PODIUM · Female · 100m');
    expect(cohortLabelFor('s|Hockey')).toBe('Hockey');
    expect(cohortLabelFor('all')).toBe('All athletes');
    expect(cohortLabelFor(null)).toBeNull();
  });
});
