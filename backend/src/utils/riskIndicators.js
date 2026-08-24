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
// One definition per PACKAGE, like utils/bands.js — there is no shared types
// package (locked). The frontend's lives in lib/screeningAlerts.ts and
// riskIndicators.test.js pins the two together.
//
// Two label vocabularies, deliberately: `label` is the terse UI wording
// ("Knee"), `reportLabel` is HoloMotion's own printed wording ("Ligament
// Strain") so a clinician can check a line against the report in hand.
const RISK_INDICATORS = [
  { key: 'neckInjuryRisk', label: 'Neck', reportLabel: 'Neck Pain' },
  { key: 'shoulderInjuryRisk', label: 'Shoulder', reportLabel: 'Shoulder Pain' },
  { key: 'scoliosis', label: 'Scoliosis', reportLabel: 'Scoliosis' },
  { key: 'lumbarPelvisInjury', label: 'Lumbar/Pelvis', reportLabel: 'Anterior Pelvic Tilt' },
  { key: 'jointPain', label: 'Joint Pain', reportLabel: 'Joint Pain' },
  { key: 'kneeInjuryRisk', label: 'Knee', reportLabel: 'Ligament Strain' },
  { key: 'ankleInjuryRisk', label: 'Ankle', reportLabel: 'Ankle Sprain' },
];

// Stored on import, never shown. Named here so the exclusion is a value the
// tests can assert against, rather than an absence nobody can check.
const EXCLUDED_RISK_KEYS = ['spinalDiscHerniation'];

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
