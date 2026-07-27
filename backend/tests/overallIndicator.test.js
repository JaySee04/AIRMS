// Overall-indicator escalation banding, with focus on the active-injury factor
// that reconnects injury logging (Module 2) to the score. Models are stubbed so
// the pure computeIndicator function can be exercised without a database.
jest.mock('../src/models', () => ({ Screening: {}, CohortThreshold: {}, Injury: {} }));

const { computeIndicator } = require('../src/utils/overallIndicator');

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

describe('active-injury escalation', () => {
  test('a screening-clean athlete with no injury is green', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 0);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('one active injury pulls a green athlete to amber', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 1);
    expect(r.escalations).toBe(1);
    expect(r.band).toBe('amber');
    expect(r.factors.some((f) => /active injur/.test(f))).toBe(true);
  });

  test('injury escalation stacks with below-mean → red', () => {
    const r = computeIndicator(SCREENING, STATS_ABOVE, null, {}, 1);
    expect(r.escalations).toBe(2);
    expect(r.band).toBe('red');
    expect(r.factors.some((f) => /below cohort average/.test(f))).toBe(true);
    expect(r.factors.some((f) => /active injur/.test(f))).toBe(true);
  });

  test('the toggle disables the factor (back to the pure cohort score)', () => {
    const r = computeIndicator(SCREENING, STATS_ON_MEAN, null, { escalation_injury: false }, 3);
    expect(r.escalations).toBe(0);
    expect(r.band).toBe('green');
  });

  test('plural vs singular wording', () => {
    expect(computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 1).factors.find((f) => /injur/.test(f))).toMatch(/1 active injury on record/);
    expect(computeIndicator(SCREENING, STATS_ON_MEAN, null, {}, 2).factors.find((f) => /injur/.test(f))).toMatch(/2 active injuries on record/);
  });
});
