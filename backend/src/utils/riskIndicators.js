// The seven exercise-risk indicators AIRMS shows — ONE definition.
//
// WHY THIS EXISTS
// This list is not a display detail. It encodes a clinical instruction from
// Dr Thung: `spinalDiscHerniation` (Lumbar Disc Herniation) is extracted from
// the HoloMotion report and stored, but ISN cannot perform that assessment, so
// it must never be scored, charted, printed or named anywhere a user can see.
// "Which indicators are shown" and "LDH is excluded" are the same decision.
//
// That decision was written out FIVE times across the backend — the cohort
// scorer, the overall indicator's labels, the cohort-focus util, the athlete
// analytics route and the PDF toolkit — plus three more on the frontend. Every
// copy carried a comment pointing at the others ("Mirrors SHOWN_RISK_KEYS in
// cohorts.js..."), which documented the hazard rather than removing it. Eight
// hand-maintained copies of a rule whose failure mode is silent and clinical:
// an eighth indicator added to six lists, or LDH added to one.
//
// Same shape as `utils/bands.js`: one definition per PACKAGE, because there is
// no shared types package (a locked decision). The frontend keeps its own in
// `lib/screeningAlerts.ts`, and `riskIndicators.test.js` pins the two together
// so they cannot drift apart unnoticed.
//
// TWO LABEL VOCABULARIES, deliberately:
//   `label`       — the terse UI wording used by dashboards and analytics.
//   `reportLabel` — HoloMotion's OWN printed wording, used by the PDF reports
//                   so a clinician can check a line against the report in their
//                   hand. These are not synonyms to be unified: "Knee" is what
//                   the dashboard says, "Ligament Strain" is what the source
//                   document says.
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
