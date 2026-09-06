// GENERATED — do not edit. Source: shared/facts.js
//
// Edit shared/facts.js at the repository root and run:
//
//     npm run sync:shared
//
// A test in this package regenerates this file in memory and fails if what is
// committed here disagrees, so an edit made directly to this file is reverted
// by the next sync and an unsynced source change is a red suite.

/** ISN's calendar. Periods bucket in it; the frontend dates rows in it. */
const INSTITUTION_TZ = 'Asia/Kuala_Lumpur';

/** The risk bands, worst LAST — the order is what BAND_RANK indexes. */
const BANDS = ['green', 'amber', 'red'];

/** Ordering for "worse than" comparisons. Higher = worse. Derived from BANDS. */
const BAND_RANK = { green: 0, amber: 1, red: 2 };

/** Wording shown to humans. GREEN IS NOT "SAFE" — see facts.js. */
const BAND_LABEL = {
  green: 'No indicators flagged',
  amber: 'Needs attention',
  red: 'Immediate assessment',
};

/** Athlete.gender enum. */
const GENDERS = ['Male', 'Female'];

/** Athlete.program enum. */
const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];

/** Age bands for the focus breakdown and the PDF report. */
const AGE_GROUPS = [
  { label: 'Under 18', max: 17 },
  { label: '18-23 (junior)', min: 18, max: 23 },
  { label: '24-29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

/** Period grains, coarsest last. */
const GRAINS = ['month', 'quarter', 'year'];

/** Display axis for every risk strip, printed and on screen. */
const RISK_AXIS_MAX = 40;

/**
 * Low <= WATCH < Watch <= HIGH < Elevated. Strictly greater-than at both edges,
 * so a value ON a boundary takes the lower band: 15 is Low, 25 is Watch.
 */
const WATCH_THRESHOLD = 15;
const HIGH_THRESHOLD = 25;

/** Stored but NEVER shown, per Dr Thung. Named so it can be asserted. */
const EXCLUDED_RISK_KEYS = ['spinalDiscHerniation'];

/** The seven shown indicators, in canonical order. */
const RISK_INDICATORS = [
  { key: 'neckInjuryRisk', region: 'Neck', reportLabel: 'Neck Pain' },
  { key: 'shoulderInjuryRisk', region: 'Shoulder', reportLabel: 'Shoulder Pain' },
  { key: 'scoliosis', region: 'Spine', reportLabel: 'Scoliosis' },
  { key: 'lumbarPelvisInjury', region: 'Lumbar/Pelvis', reportLabel: 'Anterior Pelvic Tilt' },
  { key: 'jointPain', region: 'Joint', reportLabel: 'Joint Pain' },
  { key: 'kneeInjuryRisk', region: 'Knee', reportLabel: 'Ligament Strain' },
  { key: 'ankleInjuryRisk', region: 'Ankle', reportLabel: 'Ankle Sprain' },
];

/** Peer count below which a cohort caveats itself, on every surface. */
const SMALL_COHORT = 10;

module.exports = {
  INSTITUTION_TZ,
  BANDS,
  BAND_RANK,
  BAND_LABEL,
  GENDERS,
  PROGRAMMES,
  AGE_GROUPS,
  GRAINS,
  RISK_AXIS_MAX,
  WATCH_THRESHOLD,
  HIGH_THRESHOLD,
  EXCLUDED_RISK_KEYS,
  RISK_INDICATORS,
  SMALL_COHORT,
};
