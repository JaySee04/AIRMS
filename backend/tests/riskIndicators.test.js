// The seven shown exercise-risk indicators, and the exclusion that rides with
// them.
//
// The assertion that matters most is the LDH one. `spinalDiscHerniation` is
// extracted from the HoloMotion report and stored, but ISN cannot perform that
// assessment, so Dr Thung's instruction is that it must never be scored,
// charted, printed or named anywhere a user can see. That is a clinical
// constraint whose failure is SILENT — a leaked indicator looks like a normal
// row — so it is asserted here rather than left as an absence nobody checks.
//
// This list previously stood in five backend files and three frontend ones,
// each carrying a comment pointing at the others. The comments documented the
// hazard; they could not prevent it.

const {
  RISK_INDICATORS, EXCLUDED_RISK_KEYS, SHOWN_RISK_KEYS, SHOWN_INDICATORS,
  INDICATOR_LABEL, REPORT_LABEL, REPORT_RISKS, isShownIndicator,
} = require('../src/utils/riskIndicators');

describe('shown risk indicators', () => {
  it('is exactly the seven, in report order', () => {
    expect(SHOWN_RISK_KEYS).toEqual([
      'neckInjuryRisk', 'shoulderInjuryRisk', 'scoliosis',
      'lumbarPelvisInjury', 'jointPain', 'kneeInjuryRisk', 'ankleInjuryRisk',
    ]);
  });

  // The constraint. If this test fails, a clinical instruction has been broken.
  it('never includes Lumbar Disc Herniation, in any derived form', () => {
    expect(EXCLUDED_RISK_KEYS).toContain('spinalDiscHerniation');
    for (const excluded of EXCLUDED_RISK_KEYS) {
      expect(SHOWN_RISK_KEYS).not.toContain(excluded);
      expect(Object.keys(INDICATOR_LABEL)).not.toContain(excluded);
      expect(Object.keys(REPORT_LABEL)).not.toContain(excluded);
      expect(SHOWN_INDICATORS.map((i) => i.key)).not.toContain(excluded);
      expect(REPORT_RISKS.map(([k]) => k)).not.toContain(excluded);
      expect(isShownIndicator(excluded)).toBe(false);
    }
  });

  it('keeps every derived view in step with the source list', () => {
    expect(SHOWN_INDICATORS.map((i) => i.key)).toEqual(SHOWN_RISK_KEYS);
    expect(REPORT_RISKS.map(([k]) => k)).toEqual(SHOWN_RISK_KEYS);
    expect(Object.keys(INDICATOR_LABEL)).toEqual(SHOWN_RISK_KEYS);
    expect(Object.keys(REPORT_LABEL)).toEqual(SHOWN_RISK_KEYS);
    for (const i of RISK_INDICATORS) {
      expect(i.label).toBeTruthy();
      expect(i.reportLabel).toBeTruthy();
    }
  });

  // The PDF reports print HoloMotion's OWN wording so a clinician can check a
  // line against the report in their hand; the dashboards use the terse form.
  // These are deliberately different vocabularies, not drift.
  it('keeps the report wording distinct from the UI wording', () => {
    expect(REPORT_LABEL.kneeInjuryRisk).toBe('Ligament Strain');
    expect(INDICATOR_LABEL.kneeInjuryRisk).toBe('Knee');
    expect(REPORT_LABEL.lumbarPelvisInjury).toBe('Anterior Pelvic Tilt');
    expect(INDICATOR_LABEL.lumbarPelvisInjury).toBe('Lumbar/Pelvis');
    expect(REPORT_LABEL.ankleInjuryRisk).toBe('Ankle Sprain');
  });

  it('accepts only the shown keys', () => {
    expect(isShownIndicator('neckInjuryRisk')).toBe(true);
    expect(isShownIndicator('nonsense')).toBe(false);
    expect(isShownIndicator('toString')).toBe(false); // prototype chain
  });

  // The scorer, the PDF toolkit and the analytics route must all be reading
  // this module now rather than a private copy.
  it('is the list the scorer and the PDF toolkit actually use', () => {
    const { SHOWN_RISK_KEYS: fromCohorts } = require('../src/utils/riskIndicators');
    expect(fromCohorts).toBe(SHOWN_RISK_KEYS);
    const src = require('fs').readFileSync(require.resolve('../src/utils/cohorts.js'), 'utf8');
    expect(src).toContain("require('./riskIndicators')");
    const pdf = require('fs').readFileSync(require.resolve('../src/utils/pdfDraw.js'), 'utf8');
    expect(pdf).toContain("require('./riskIndicators')");
  });
});
