// GENERATED — do not edit. Source: shared/facts.js
//
// Edit shared/facts.js at the repository root and run:
//
//     npm run sync:shared
//
// A test in this package regenerates this file in memory and fails if what is
// committed here disagrees, so an edit made directly to this file is reverted
// by the next sync and an unsynced source change is a red suite.

/** ISN's calendar. Periods bucket in it; dates render in it. */
export const INSTITUTION_TZ = 'Asia/Kuala_Lumpur';

export type Band = 'green' | 'amber' | 'red';

/** The risk bands, worst LAST — the order is what BAND_RANK indexes. */
export const BANDS: Band[] = ['green', 'amber', 'red'];

/** Ordering for "worse than" comparisons. Higher = worse. Derived from BANDS. */
export const BAND_RANK: Record<Band, number> = { green: 0, amber: 1, red: 2 };

/** Full clinical wording. GREEN IS NOT "SAFE" — see shared/facts.js. */
export const BAND_LABEL: Record<Band, string> = {
  green: 'No indicators flagged',
  amber: 'Needs attention',
  red: 'Immediate assessment',
};

export type Role = 'athlete' | 'medical' | 'admin' | 'coach' | 'executive';

/**
 * users.role enum. The set is exported as a VALUE, not only as a type, because
 * the role arrives from localStorage and from the API — places no type reaches,
 * and where lib/auth.ts has to ask "is this one of ours?" at runtime (§111.6).
 *
 * (No backticks in this comment on purpose: the renderer is a template literal,
 * so one would end the string. It cost a SyntaxError to find out.)
 */
export const ROLES: Role[] = ['athlete', 'medical', 'admin', 'coach', 'executive'];

export type Gender = 'Male' | 'Female';

/** Athlete.gender enum. A filter offering anything else returns nothing. */
export const GENDERS: Gender[] = ['Male', 'Female'];

export type Programme = 'PODIUM' | 'PELAPIS' | 'OTHERS';

/** Athlete.program enum. */
export const PROGRAMMES: Programme[] = ['PODIUM', 'PELAPIS', 'OTHERS'];

export interface AgeGroup { label: string; min?: number; max?: number }

/**
 * Age bands for the focus breakdown and the PDF report.
 *
 * The filter dropdown prepends its own "All ages" entry — a filter option
 * rather than a band, which is why it is not here.
 */
export const AGE_GROUPS: AgeGroup[] = [
  { label: 'Under 18', max: 17 },
  { label: '18-23 (junior)', min: 18, max: 23 },
  { label: '24-29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

export type Grain = 'month' | 'quarter' | 'year';

/** Period grains, coarsest last. */
export const GRAINS: Grain[] = ['month', 'quarter', 'year'];

/** Display axis for every risk strip, printed and on screen. */
export const RISK_AXIS_MAX = 40;

/**
 * Low <= WATCH < Watch <= HIGH < Elevated. Strictly greater-than at both edges,
 * so a value ON a boundary takes the lower band: 15 is Low, 25 is Watch.
 *
 * These are the INSTRUMENT baseline. The sport-tightened thresholds in
 * lib/screeningAlerts.ts start from them and are deliberately not shared.
 */
export const WATCH_THRESHOLD = 15;
export const HIGH_THRESHOLD = 25;

/** Stored but NEVER shown, per Dr Thung. Named so it can be asserted. */
export const EXCLUDED_RISK_KEYS: string[] = ['spinalDiscHerniation'];

export type RiskKey = 'neckInjuryRisk' | 'shoulderInjuryRisk' | 'scoliosis' | 'lumbarPelvisInjury' | 'jointPain' | 'kneeInjuryRisk' | 'ankleInjuryRisk';

export type BodyRegion = 'Neck' | 'Shoulder' | 'Spine' | 'Lumbar/Pelvis' | 'Joint' | 'Knee' | 'Ankle';

export interface RiskIndicator { key: RiskKey; region: BodyRegion; reportLabel: string }

/**
 * The seven shown indicators, in canonical order.
 *
 * `reportLabel` is HoloMotion's OWN printed wording, so a clinician can check a
 * line against the PDF in their hand. Each package adds its own display label.
 */
export const RISK_INDICATORS: RiskIndicator[] = [
  { key: 'neckInjuryRisk', region: 'Neck', reportLabel: 'Neck Pain' },
  { key: 'shoulderInjuryRisk', region: 'Shoulder', reportLabel: 'Shoulder Pain' },
  { key: 'scoliosis', region: 'Spine', reportLabel: 'Scoliosis' },
  { key: 'lumbarPelvisInjury', region: 'Lumbar/Pelvis', reportLabel: 'Anterior Pelvic Tilt' },
  { key: 'jointPain', region: 'Joint', reportLabel: 'Joint Pain' },
  { key: 'kneeInjuryRisk', region: 'Knee', reportLabel: 'Ligament Strain' },
  { key: 'ankleInjuryRisk', region: 'Ankle', reportLabel: 'Ankle Sprain' },
];

/** Peer count below which a cohort caveats itself, on every surface. */
export const SMALL_COHORT = 10;

/** One recorded clinical response to an escalation. */
export type ResponseOutcome = { key: string; label: string };

/**
 * What a clinician recorded DOING about an escalation — ordered least to most
 * intervention. NOT a severity scale and must never be drawn as one; these are
 * responses, never diagnoses.
 */
export const RESPONSE_OUTCOMES: ResponseOutcome[] = [
  { key: 'assessed-none', label: 'Assessed — no action needed' },
  { key: 'monitoring', label: 'Monitoring — re-check next screening' },
  { key: 'treating', label: 'Assessed — now treating' },
  { key: 'referred', label: 'Referred on' },
];

/** Just the keys, for validation. */
export const RESPONSE_OUTCOME_KEYS = ['assessed-none', 'monitoring', 'treating', 'referred'];
