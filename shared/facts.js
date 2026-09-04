// The facts both packages must agree on. ONE definition, generated into each.
//
// ── why a generator and not a shared package ────────────────────────────────
//
// The obvious answer is an npm workspace that both packages import. It does not
// work here, and the reason is deployment rather than taste: Vercel builds
// `airms-api` with Root Directory `backend` and `airms-web` with Root Directory
// `frontend`, so anything at the repository root is **not in either build
// context**. A shared package would resolve locally, pass every test, and fail
// the moment it deployed — taking the live instance down with it. That is
// exactly the class of failure this codebase keeps finding, so it is not a
// trade worth making for tidiness.
//
// Instead this file is the single source, and `npm run sync:shared` writes:
//
//     backend/src/shared/facts.js        (CommonJS)
//     frontend/src/lib/shared/facts.ts   (TypeScript, `as const`)
//
// Both are COMMITTED, so each build context is self-contained and nothing about
// the deployment changes. A test in each package regenerates in memory and
// fails if the committed copy is stale, so the two cannot drift: editing this
// file and forgetting to sync is a red suite, not a silent divergence.
//
// ── what belongs here ───────────────────────────────────────────────────────
//
// FACTS, not presentation. The indicator list is a fact — its keys, their order,
// HoloMotion's printed wording, and which key is excluded. The wording each
// package chooses for its own screens is not: the backend says 'Joint Pain' and
// the frontend says 'Joint pain', deliberately, and forcing those together would
// be unifying a difference rather than removing a duplication.
//
// If a value differs between the packages ON PURPOSE, it does not belong here.

/** ISN's calendar. Periods bucket in it; the frontend dates rows in it. */
const INSTITUTION_TZ = 'Asia/Kuala_Lumpur';

/**
 * The risk bands, worst LAST. The order is load-bearing: rank is the index, so
 * reversing this silently inverts every "worse than" comparison.
 */
const BANDS = ['green', 'amber', 'red'];

/**
 * Wording shown to humans.
 *
 * GREEN IS NOT "SAFE". A screening test cannot predict injury, so it cannot
 * certify the absence of it either — and since most athletes are low-risk, green
 * is precisely where a false reassurance would land. The label describes THE
 * FINDING, not the athlete. Green was once absent from the backend map entirely,
 * which is how two call sites grew private copies saying 'Safe'
 * (DESIGN_DECISIONS §33).
 */
const BAND_LABEL = {
  green: 'No indicators flagged',
  amber: 'Needs attention',
  red: 'Immediate assessment',
};

/** Athlete.gender enum. A filter offering anything else returns nothing. */
const GENDERS = ['Male', 'Female'];

/** Athlete.program enum. */
const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];

/**
 * Age bands for the focus breakdown and the PDF report.
 *
 * The frontend filter prepends an "All ages" option, which is a filter choice
 * rather than a band and so is not defined here.
 */
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
 * Stored but NEVER shown: Dr Thung's instruction that Lumbar Disc Herniation is
 * not scored, charted, printed or named anywhere.
 *
 * Named as a value rather than left as an absence, so it can be ASSERTED — a
 * leaked indicator would otherwise render as an ordinary row (§31).
 */
const EXCLUDED_RISK_KEYS = ['spinalDiscHerniation'];

/**
 * The seven shown indicators, in canonical order.
 *
 * `key` is the column. `region` is the body area it belongs to. `reportLabel` is
 * HoloMotion's OWN printed wording, so a clinician can check a line against the
 * PDF in their hand — it is the instrument's vocabulary, not ours, and must not
 * be "improved".
 *
 * Each package adds its own display `label` on top; those differ on purpose.
 */
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
  BAND_LABEL,
  GENDERS,
  PROGRAMMES,
  AGE_GROUPS,
  GRAINS,
  RISK_AXIS_MAX,
  EXCLUDED_RISK_KEYS,
  RISK_INDICATORS,
  SMALL_COHORT,
};
