// Cohort-norm engine math — the reference distribution every athlete is
// z-scored against (the live graded indicator's foundation). We isolate the
// pure functions by stubbing the Sequelize models the module imports, so these
// tests never need a database.
jest.mock('../src/models', () => ({ Screening: {}, Athlete: {}, CohortThreshold: {} }));

const {
  meanSd, orientedComponents, resolveFromMap, buildApprovedCohortMap,
} = require('../src/utils/cohorts');

describe('meanSd', () => {
  test('sample mean + unbiased (n-1) standard deviation', () => {
    // [2,4,4,4,5,5,7,9]: mean 5, sum of squared deviations 32, /(8-1) → sd 2.138
    expect(meanSd([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mean: 5, sd: 2.138, n: 8 });
  });

  test('a single value has zero SD (no division by zero)', () => {
    expect(meanSd([5])).toEqual({ mean: 5, sd: 0, n: 1 });
  });

  test('nulls are dropped; an all-null/empty set is unscoreable', () => {
    expect(meanSd([10, null, 20, undefined])).toEqual({ mean: 15, sd: 7.071, n: 2 });
    expect(meanSd([])).toBeNull();
    expect(meanSd([null, undefined])).toBeNull();
  });
});

describe('orientedComponents', () => {
  test('riskGood is the negated mean of the shown risk indicators (higher = better)', () => {
    const s = {
      totalScore: 72, rom: 80, stability: 78, symmetry: 90,
      neckInjuryRisk: 10, shoulderInjuryRisk: 10, scoliosis: 10,
      lumbarPelvisInjury: 10, jointPain: 10, kneeInjuryRisk: 10, ankleInjuryRisk: 10,
    };
    const c = orientedComponents(s);
    expect(c.riskGood).toBe(-10);
    expect(c.totalScore).toBe(72);
    expect(c.balance).toBeNull(); // no subitems supplied
  });

  test('balance is the negated mean left/right asymmetry from subitems', () => {
    const s = {
      subitems: { knee: { romL: 10, romR: 14, stabL: 5, stabR: 5 } }, // diffs 4 and 0 → mean 2
    };
    expect(orientedComponents(s).balance).toBe(-2);
  });
});

describe('resolveFromMap (cohort fallback ladder)', () => {
  const athlete = { sport: 'Badminton', program: 'PODIUM', gender: 'Male' };
  const row = (tier, sport, programme, gender, n, stats = {}) => ({ tier, sport, programme, gender, n, stats });

  test('falls back to a broader tier when specific ones are absent', () => {
    const map = buildApprovedCohortMap([row('s', 'Badminton', null, null, 8, { totalScore: { mean: 70, sd: 5, n: 8 } })]);
    const res = resolveFromMap(athlete, map, { minN: 5 });
    expect(res).not.toBeNull();
    expect(res.tier).toBe('s');
    expect(res.n).toBe(8);
  });

  test('a cohort below minN is skipped (returns null when nothing qualifies)', () => {
    const map = buildApprovedCohortMap([row('spg', 'Badminton', 'PODIUM', 'Male', 3)]);
    expect(resolveFromMap(athlete, map, { minN: 5 })).toBeNull();
  });

  test('fallback disabled only consults the most-specific tier', () => {
    const map = buildApprovedCohortMap([row('s', 'Badminton', null, null, 8)]);
    expect(resolveFromMap(athlete, map, { minN: 5, fallbackEnabled: false })).toBeNull();
  });

  test('admin overrides are layered over the computed component stats', () => {
    const map = buildApprovedCohortMap([{
      ...row('spg', 'Badminton', 'PODIUM', 'Male', 6, { totalScore: { mean: 70 } }),
      overrides: { totalScore: { mean: 99 } },
    }]);
    const res = resolveFromMap(athlete, map, { minN: 5 });
    expect(res.stats.totalScore.mean).toBe(99);
  });
});
