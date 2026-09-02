// Cohort-norm engine math — the reference distribution every athlete is
// z-scored against (the live graded indicator's foundation). We isolate the
// pure functions by stubbing the Sequelize models the module imports, so these
// tests never need a database.
jest.mock('../src/models', () => ({ Screening: {}, Athlete: {}, CohortThreshold: {} }));

const {
  SMALL_COHORT,
  meanSd, orientedComponents, resolveFromMap, buildApprovedCohortMap,
  cohortReview, pinDrift, screeningMovement,
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

describe('cohortReview (manual-norm drift vs new data)', () => {
  test('flags a component whose manual mean drifts > 0.5 from the computed mean', () => {
    const r = cohortReview({
      overrides: { totalScore: { mean: 70 } },
      stats: { totalScore: { mean: 74.2 } },
    });
    expect(r.needed).toBe(true);
    expect(r.items).toEqual([{ component: 'totalScore', manual: 70, computed: 74.2, delta: 4.2 }]);
  });

  test('ignores drift within the 0.5 noise floor', () => {
    const r = cohortReview({
      overrides: { rom: { mean: 80 } },
      stats: { rom: { mean: 80.4 } },
    });
    expect(r.needed).toBe(false);
    expect(r.items).toEqual([]);
  });

  test('no overrides → nothing to review', () => {
    expect(cohortReview({ stats: { totalScore: { mean: 74 } } })).toEqual({ needed: false, items: [] });
  });

  test('a component with no computed counterpart is skipped, not flagged', () => {
    const r = cohortReview({ overrides: { balance: { mean: -2 } }, stats: {} });
    expect(r.needed).toBe(false);
  });
});

describe('screeningMovement (previous vs latest + injury floor)', () => {
  // A: improving + band better · B: declining + band worse · D: steady ·
  // C: single screening, injury-floored to amber (not comparable for the trend).
  const rows = [
    { athleteId: 'A', assessedAt: '2025-01-01', id: 1, overallIndicator: 45, overallBand: 'amber', totalScore: 70 },
    { athleteId: 'A', assessedAt: '2025-06-01', id: 2, overallIndicator: 55, overallBand: 'green', totalScore: 74 },
    { athleteId: 'B', assessedAt: '2025-01-01', id: 3, overallIndicator: 60, overallBand: 'green', totalScore: 80 },
    { athleteId: 'B', assessedAt: '2025-06-01', id: 4, overallIndicator: 52, overallBand: 'amber', totalScore: 78 },
    { athleteId: 'D', assessedAt: '2025-01-01', id: 5, overallIndicator: 50, overallBand: 'green', totalScore: 60 },
    { athleteId: 'D', assessedAt: '2025-06-01', id: 6, overallIndicator: 51, overallBand: 'green', totalScore: 60 },
    { athleteId: 'C', assessedAt: '2025-06-01', id: 7, overallIndicator: 48, overallBand: 'amber', escalations: 0, factors: ['1 significant active injury'], totalScore: 72 },
  ];

  test('comparable counts only athletes with two screenings', () => {
    expect(screeningMovement(rows).trend.comparable).toBe(3); // A, B, D — not C
  });

  test('momentum buckets by ±2 indicator points', () => {
    const { trend } = screeningMovement(rows);
    expect(trend.improving).toBe(1); // A +10
    expect(trend.declining).toBe(1); // B -8
    expect(trend.steady).toBe(1);    // D +1
  });

  test('band moves counted better/worse', () => {
    expect(screeningMovement(rows).trend.bandMoves).toEqual({ better: 1, worse: 1 }); // A amber→green, B green→amber
  });

  test('average per-score delta (higher=better flag preserved)', () => {
    const d = screeningMovement(rows).trend.deltas.find((x) => x.key === 'totalScore');
    expect(d.higherBetter).toBe(true);
    expect(d.avgDelta).toBe(0.7); // (+4 -2 +0) / 3 = 0.666… → 0.7
  });

  test('empty input is safe', () => {
    expect(screeningMovement([]).trend.comparable).toBe(0);
  });
});

// ── pinDrift: how far a HELD norm has moved from what the data now says ──────
//
// The honesty half of pinning. A pin freezes the norm every athlete is scored
// against, which is the point (one baseline for a season) and the danger (it goes
// stale silently). These tests pin the behaviour that makes the staleness
// visible, and in particular that drift is measured against the norm ACTUALLY IN
// FORCE — a manual override on top of a pinned snapshot is what governs, so
// comparing against the raw snapshot would report the wrong gap.
describe('pinDrift', () => {
  it('reports nothing when no fresh computation is parked (nothing pinned)', () => {
    const d = pinDrift({ stats: { totalScore: { mean: 74 } }, freshStats: null });
    expect(d).toEqual({ held: false, items: [], worst: null, nDelta: null });
  });

  it('compares the held stats against what the data would now produce', () => {
    const d = pinDrift({
      n: 9,
      stats: { totalScore: { mean: 74 }, rom: { mean: 70 } },
      freshStats: { totalScore: { mean: 77.5 }, rom: { mean: 70.2 } },
      freshN: 14,
    });
    expect(d.held).toBe(true);
    // rom moved 0.2, inside DRIFT_EPSILON, so only totalScore is reported.
    expect(d.items).toEqual([{ component: 'totalScore', inForce: 74, now: 77.5, delta: 3.5 }]);
    expect(d.worst.component).toBe('totalScore');
    expect(d.nDelta).toBe(5);
  });

  it('measures against a manual OVERRIDE when one is layered on the pin', () => {
    // The override is what governs, so the gap the admin needs is 80 → 77.5,
    // not the snapshot's 74 → 77.5.
    const d = pinDrift({
      n: 9,
      stats: { totalScore: { mean: 74 } },
      overrides: { totalScore: { mean: 80 } },
      freshStats: { totalScore: { mean: 77.5 } },
      freshN: 9,
    });
    expect(d.items[0]).toEqual({ component: 'totalScore', inForce: 80, now: 77.5, delta: -2.5 });
  });

  it('orders worst-first by magnitude, in either direction', () => {
    const d = pinDrift({
      stats: { a: { mean: 50 }, b: { mean: 50 }, c: { mean: 50 } },
      freshStats: { a: { mean: 52 }, b: { mean: 41 }, c: { mean: 55 } },
    });
    expect(d.items.map((i) => i.component)).toEqual(['b', 'c', 'a']);
    expect(d.worst.delta).toBe(-9);
  });

  it('ignores components the fresh computation could not produce', () => {
    const d = pinDrift({
      stats: { totalScore: { mean: 74 }, balance: { mean: -4 } },
      freshStats: { totalScore: { mean: 74.1 } },
    });
    expect(d.items).toEqual([]);
    expect(d.worst).toBeNull();
  });

  it('reports no n movement when the fresh count is unknown', () => {
    const d = pinDrift({ n: 9, stats: { x: { mean: 1 } }, freshStats: { x: { mean: 1 } } });
    expect(d.nDelta).toBeNull();
  });
});

// ── The small-cohort caveat is ONE number ───────────────────────────────────
//
// It was written out three times — the risk badge, the individual PDF, and the
// measurement script — each with a comment naming the others. One of those
// comments had already drifted into a falsehood: it claimed the value was read
// from the component when it had been retyped. A comment pointing at another
// file documents the hazard without preventing it (§31, §42).
//
// The backend now has one definition. The frontend keeps its own because there
// is no shared types package, so this pins them — a cohort hedged on screen and
// stated flatly in the printed report is the drift this codebase keeps finding,
// and the report is the copy that gets filed.
describe('SMALL_COHORT is not restated anywhere', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..');

  it('matches the frontend badge that renders the caveat', () => {
    const src = fs.readFileSync(
      path.join(root, 'frontend', 'src', 'components', 'dashboard', 'OverallRiskBadge.tsx'),
      'utf8',
    );
    const m = src.match(/const SMALL_COHORT = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(SMALL_COHORT);
  });

  it('is imported by the report and the script, not retyped', () => {
    for (const rel of [
      ['backend', 'src', 'routes', 'screeningReports.js'],
      ['backend', 'scripts', 'measure-facts.js'],
    ]) {
      const src = fs.readFileSync(path.join(root, ...rel), 'utf8');
      // Uses it...
      expect(src).toMatch(/\bSMALL_COHORT\b/);
      // ...but does not define it.
      expect(src).not.toMatch(/const SMALL_COHORT\s*=/);
    }
  });

  it('is a plausible peer count, not an accidental zero', () => {
    expect(SMALL_COHORT).toBeGreaterThan(1);
    expect(Number.isInteger(SMALL_COHORT)).toBe(true);
  });
});
