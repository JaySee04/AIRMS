// Tests for the locked composite injury-risk model (the FYP differentiator).
// Covers the three exported pieces: the vulnerability score, the personalised
// ACWR thresholds it drives, and the escalation logic that layers injury +
// biomechanical context on top of the raw ACWR band.
import { computeVulnerability, personalisedThresholds, classifyCompositeRisk, AthleteProfile } from './risk';

// A maximally robust athlete → vulnerability 0 → widest personalised band.
const ROBUST: AthleteProfile = { injuryRiskIndex: 0, overallActivityScore: 100, mobility: 100, stability: 100, symmetry: 100 };

describe('computeVulnerability', () => {
  test('a maximally robust athlete scores 0', () => {
    expect(computeVulnerability(ROBUST)).toBe(0);
  });

  test('a maximally at-risk athlete scores 1 (weights sum to 1)', () => {
    expect(computeVulnerability({ injuryRiskIndex: 40, overallActivityScore: 0, mobility: 0, stability: 0, symmetry: 0 })).toBe(1);
  });

  test('missing fields fall back to the documented defaults', () => {
    // iri 15/40*.30 + .2*.20 + .2*.20 + .2*.15 + .2*.15 = 0.2525
    expect(computeVulnerability({})).toBeCloseTo(0.2525, 4);
  });
});

describe('personalisedThresholds', () => {
  test('vulnerability 0.4 reproduces the textbook Gabbett bands', () => {
    expect(personalisedThresholds(0.4)).toEqual({ lowMin: 0.8, lowMax: 1.3, modMax: 1.5 });
  });

  test('extreme vulnerability is clamped so the band can never invert', () => {
    const high = personalisedThresholds(1); // raw 1.24 → clamped factor 1.15
    expect(high.lowMin).toBeCloseTo(0.92, 2);
    expect(high.lowMax).toBeLessThan(high.modMax);
    const low = personalisedThresholds(0); // raw 0.84 → clamped factor 0.85
    expect(low.lowMin).toBeCloseTo(0.68, 2);
  });
});

describe('classifyCompositeRisk', () => {
  test('an in-band workload with no context is plain Low Risk, not escalated', () => {
    const r = classifyCompositeRisk(1.0, ROBUST, []);
    expect(r.baseCls).toBe('low');
    expect(r.cls).toBe('low');
    expect(r.escalated).toBe(false);
    expect(r.level).toBe('Low Risk');
  });

  test('workload below the personalised floor reads as detraining risk', () => {
    expect(classifyCompositeRisk(0.5, ROBUST, []).cls).toBe('under');
  });

  test('an active injury escalates a Moderate band to Compound High Risk', () => {
    const r = classifyCompositeRisk(1.6, ROBUST, [{ recoveryStatus: 'Recovering' }]);
    expect(r.baseCls).toBe('mod');
    expect(r.cls).toBe('high');
    expect(r.escalated).toBe(true);
    expect(r.level).toMatch(/Compound High Risk/);
    expect(r.factors.some((f) => /active injury/.test(f))).toBe(true);
  });

  test('five or more muscle flags escalate a Low band above 1.1 ACWR', () => {
    const flagged: AthleteProfile = {
      ...ROBUST,
      myodynamia: [{ muscle: 'a', side: 'L' }, { muscle: 'b', side: 'R' }, { muscle: 'c', side: 'B' }],
      tension: [{ muscle: 'd', side: 'L' }, { muscle: 'e', side: 'R' }],
    };
    const r = classifyCompositeRisk(1.2, flagged, []);
    expect(r.baseCls).toBe('low');
    expect(r.cls).toBe('mod');
    expect(r.escalated).toBe(true);
    expect(r.factors.some((f) => /muscle flag/.test(f))).toBe(true);
  });
});
