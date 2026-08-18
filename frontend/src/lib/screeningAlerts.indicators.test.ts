// The frontend's shown-indicator list, pinned to the backend's.
//
// There is no shared types package (a locked decision), so the two packages each
// keep one definition and nothing at build time stops them diverging. The same
// argument as `bands.test.ts`: pin the cross-package agreement where a change
// trips a test.
//
// The LDH assertion is the one that matters. `spinalDiscHerniation` is stored
// but must never be displayed or alerted on (Dr Thung — ISN cannot perform that
// assessment). Its failure mode is silent, so it is asserted rather than assumed.

import { INDICATORS, RADAR_AXES, RADAR_LABELS, REPORT_RISKS } from './screeningAlerts';

// Mirrors backend/src/utils/riskIndicators.js — change both together.
const BACKEND_KEYS = [
  'neckInjuryRisk', 'shoulderInjuryRisk', 'scoliosis',
  'lumbarPelvisInjury', 'jointPain', 'kneeInjuryRisk', 'ankleInjuryRisk',
];
const BACKEND_REPORT_LABELS = [
  'Neck Pain', 'Shoulder Pain', 'Scoliosis', 'Anterior Pelvic Tilt',
  'Joint Pain', 'Ligament Strain', 'Ankle Sprain',
];

describe('shown indicators (frontend)', () => {
  it('matches the backend key list exactly, and in the same order', () => {
    expect(INDICATORS.map((i) => i.key)).toEqual(BACKEND_KEYS);
  });

  // The constraint. If this fails, a clinical instruction has been broken.
  it('never includes Lumbar Disc Herniation, in any derived view', () => {
    for (const list of [
      INDICATORS.map((i) => i.key),
      RADAR_AXES.map((a) => a.key),
      REPORT_RISKS.map(([k]) => k),
    ]) {
      expect(list).not.toContain('spinalDiscHerniation');
    }
    expect(RADAR_LABELS.join(' ')).not.toMatch(/hernia|disc/i);
  });

  // These were separate hand-written lists; deriving them is the whole point,
  // so assert they actually track the source rather than merely agreeing today.
  it('derives every view from the one list', () => {
    expect(RADAR_AXES.map((a) => a.key)).toEqual(BACKEND_KEYS);
    expect(REPORT_RISKS.map(([k]) => k)).toEqual(BACKEND_KEYS);
    expect(RADAR_LABELS).toEqual(INDICATORS.map((i) => i.axisLabel));
  });

  it('carries HoloMotion’s printed wording, matching the backend PDF labels', () => {
    expect(REPORT_RISKS.map(([, label]) => label)).toEqual(BACKEND_REPORT_LABELS);
  });

  // The axis form is terser than the prose form on purpose — a chart spoke has
  // no room for "Lumbar / pelvis". Distinct vocabularies, not drift.
  it('keeps the axis wording distinct from the prose wording', () => {
    const lumbar = INDICATORS.find((i) => i.key === 'lumbarPelvisInjury')!;
    expect(lumbar.label).toBe('Lumbar / pelvis');
    expect(lumbar.axisLabel).toBe('Lumbar/Pelvis');
    expect(lumbar.reportLabel).toBe('Anterior Pelvic Tilt');
  });

  it('gives every indicator a body region for the map', () => {
    for (const i of INDICATORS) expect(i.region).toBeTruthy();
  });
});
