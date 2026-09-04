// The seven exercise-risk indicators AIRMS shows — ONE definition.
//
// Not a display detail. It encodes Dr Thung's instruction that
// `spinalDiscHerniation` (Lumbar Disc Herniation) is extracted and stored but
// never scored, charted, printed or named — ISN cannot perform that assessment.
// "Which indicators are shown" and "LDH is excluded" are one decision.
//
// It had been written out eight times (five backend, three frontend), each copy
// carrying a comment pointing at the others, which documented the hazard instead
// of removing it. The failure mode is silent and clinical: an indicator added to
// six lists of seven, or LDH added to one.
//
// The KEYS, their ORDER, their body region, HoloMotion's printed wording and
// the exclusion now come from shared/facts.js and are generated into both
// packages — see src/shared/facts.js. What stays here is this package's own
// display wording, which is deliberately NOT shared: the backend says
// 'Joint Pain' and the frontend says 'Joint pain', and unifying that would be
// erasing a difference rather than removing a duplication.
const { RISK_INDICATORS: SHARED_INDICATORS, EXCLUDED_RISK_KEYS } = require('../shared/facts');

// Terse UI wording, this package's own. `reportLabel` is HoloMotion's printed
// wording and is not ours to choose; this one is.
const UI_LABEL = {
  neckInjuryRisk: 'Neck',
  shoulderInjuryRisk: 'Shoulder',
  scoliosis: 'Scoliosis',
  lumbarPelvisInjury: 'Lumbar/Pelvis',
  jointPain: 'Joint Pain',
  kneeInjuryRisk: 'Knee',
  ankleInjuryRisk: 'Ankle',
};

// Composed rather than re-listed, and LOUD when incomplete: an indicator added
// to shared/facts.js without a label here would otherwise render as `undefined`
// on a clinical report and in an email subject, which is precisely the silent
// wrongness this module exists to prevent. Failing at require time makes it a
// dead process instead — caught by any test, and by boot.
const RISK_INDICATORS = SHARED_INDICATORS.map(({ key, region, reportLabel }) => {
  const label = UI_LABEL[key];
  if (!label) {
    throw new Error(`riskIndicators: no UI label for "${key}" — add one to UI_LABEL in this file`);
  }
  return { key, region, label, reportLabel };
});

const SHOWN_RISK_KEYS = RISK_INDICATORS.map((i) => i.key);
const INDICATOR_LABEL = Object.fromEntries(RISK_INDICATORS.map((i) => [i.key, i.label]));
const REPORT_LABEL = Object.fromEntries(RISK_INDICATORS.map((i) => [i.key, i.reportLabel]));

// Key/label pairs in the two shapes the call sites already wanted.
const SHOWN_INDICATORS = RISK_INDICATORS.map(({ key, label }) => ({ key, label }));
const REPORT_RISKS = RISK_INDICATORS.map((i) => [i.key, i.reportLabel]);

const isShownIndicator = (k) => Object.prototype.hasOwnProperty.call(INDICATOR_LABEL, k);

module.exports = {
  RISK_INDICATORS,
  EXCLUDED_RISK_KEYS,
  SHOWN_RISK_KEYS,
  SHOWN_INDICATORS,
  INDICATOR_LABEL,
  REPORT_LABEL,
  REPORT_RISKS,
  isShownIndicator,
};
