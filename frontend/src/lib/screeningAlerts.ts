// Sport-aware screening alerts.
//
// Different sports stress different body regions: a runner's knees/ankles
// matter more than their neck; a swimmer's shoulders matter more than their
// knees. This module flags HoloMotion exercise-risk indicators that are out of
// a healthy range AND belong to a region that is *critical for the athlete's
// sport* — surfacing "your important part is not in good shape" before the
// generic workload signal.
//
// This is a SEPARATE layer from the graded composite-risk model in risk.ts —
// it does not modify classifyCompositeRisk(). It reads only the 8 per-region
// exercise-risk indicators AIRMS stores from the HoloMotion report.

export interface AthleteRisks {
  neckInjuryRisk: number;
  shoulderInjuryRisk: number;
  scoliosis: number;
  spinalDiscHerniation: number;
  lumbarPelvisInjury: number;
  jointPain: number;
  kneeInjuryRisk: number;
  ankleInjuryRisk: number;
}

// Body regions used for sport-importance mapping. The 8 indicators collapse
// into these — two spine indicators (scoliosis, spinal disc) share "Spine".
export type BodyRegion = 'Neck' | 'Shoulder' | 'Spine' | 'Lumbar/Pelvis' | 'Joint' | 'Knee' | 'Ankle';

// Each stored indicator → its region + a human label. Exported so screening
// visualisations share the same region mapping the alert layer uses.
// spinalDiscHerniation (Lumbar Disc Herniation) is deliberately ABSENT: it is
// extracted and stored, but excluded from every risk display AND from the
// sport-critical alerts per Dr Thung — ISN's facilities don't support that
// assessment, so AIRMS must never raise a finding against it. The scoring
// counterpart is SHOWN_RISK_KEYS in backend/src/utils/cohorts.js.
export const INDICATORS: Array<{ key: keyof AthleteRisks; region: BodyRegion; label: string }> = [
  { key: 'neckInjuryRisk', region: 'Neck', label: 'Neck' },
  { key: 'shoulderInjuryRisk', region: 'Shoulder', label: 'Shoulder' },
  { key: 'scoliosis', region: 'Spine', label: 'Scoliosis' },
  { key: 'lumbarPelvisInjury', region: 'Lumbar/Pelvis', label: 'Lumbar / pelvis' },
  { key: 'jointPain', region: 'Joint', label: 'Joint pain' },
  { key: 'kneeInjuryRisk', region: 'Knee', label: 'Knee' },
  { key: 'ankleInjuryRisk', region: 'Ankle', label: 'Ankle' },
];

// Radar-axis view of the shown indicators. Separate from INDICATORS.label only
// because a chart axis needs terser Title Case than the prose alert layer; the
// keys and their order are identical, and the LDH exclusion is inherited — so
// INDICATORS remains the one place deciding WHICH indicators are shown.
export const RADAR_AXES: Array<{ key: keyof AthleteRisks; label: string }> = [
  { key: 'neckInjuryRisk', label: 'Neck' },
  { key: 'shoulderInjuryRisk', label: 'Shoulder' },
  { key: 'scoliosis', label: 'Scoliosis' },
  { key: 'lumbarPelvisInjury', label: 'Lumbar/Pelvis' },
  { key: 'jointPain', label: 'Joint Pain' },
  { key: 'kneeInjuryRisk', label: 'Knee' },
  { key: 'ankleInjuryRisk', label: 'Ankle' },
];

export const RADAR_LABELS: string[] = RADAR_AXES.map((a) => a.label);

// Tighter than the strips' 40: the radar compares shapes, so clamping to 30
// keeps real readings (which top out near 27) legible across the plot.
export const RADAR_MAX = 30;

// Values for the radar's spokes, clamped into [0, RADAR_MAX] so an out-of-range
// backend value can't silently clip outside the chart.
export function riskRadarSeries(risks: AthleteRisks): number[] {
  return RADAR_AXES.map(({ key }) => Math.min(RADAR_MAX, Math.max(0, risks[key] ?? 0)));
}

// Exercise-risk indicators are 0–40 on AIRMS' display axis, lower is better.
//
// BAND VOCABULARY — must agree with the PDF reports (backend/src/routes/
// screeningReports.js) and the admin cohort analytics (backend/src/routes/
// athletes.js). All three read the same numbers, so they must say the same
// words about them.
//
//   HoloMotion prints:  Low 0–15 │ Medium 16–55        │ High 56–100
//   AIRMS shows:        Low ≤15  │ Watch 16–25 · Elevated >25
//
// AIRMS' Low boundary is the report's Low boundary exactly. Above it, AIRMS
// SUBDIVIDES the report's broad Medium band into Watch and Elevated, because
// ISN wants to act well before an athlete drifts toward the top of Medium.
// AIRMS deliberately never uses the word "High": the report reserves that for
// 56–100, which is far above anything the instrument produces in practice
// (the two ground-truth reports top out at 27). Calling a 26 "High Risk" — as
// AIRMS did until 2026-07-16 — directly contradicted the printed report a
// clinician would be holding, and disagreed with our own PDFs.
export const WATCH_THRESHOLD = 15;
export const HIGH_THRESHOLD = 25;

// Display axis for the threshold strips + PDF gauges. Real readings sit well
// inside this; the report's own 56–100 High band is off-axis by design.
export const RISK_AXIS_MAX = 40;

// The single label set for the three bands. `high` is the internal key kept for
// back-compat; its user-facing word is "Elevated" (see the note above).
export const BAND_LABEL: Record<'ok' | 'watch' | 'high', string> = {
  ok: 'Low',
  watch: 'Watch',
  high: 'Elevated',
};

// Sport-tightened bands. Every athlete takes the SAME eight tests, but the
// thresholds each test is judged against depend on the athlete's sport: a
// region the sport loads heavily is held to a stricter standard (~20% tighter,
// mirroring the composite risk model's ±15% personalisation scale), while all
// other regions keep the instrument's own bands. Tightening-only by design —
// AIRMS never waits LONGER than the report's own Low boundary to flag a
// problem, so no sport/region pair is less protected than the instrument.
export const TIGHT_WATCH_THRESHOLD = 12;
export const TIGHT_HIGH_THRESHOLD = 20;

export interface RegionThresholds {
  watch: number;
  high: number;
  tightened: boolean; // true when this sport holds this region to the stricter bands
}

// The (watch, high) pair a given indicator region is judged against for a
// given sport — the single source of truth used by the alert layer, the
// dashboard threshold strips, and the training-focus recommendations.
export function thresholdsFor(sport: string | undefined, region: BodyRegion): RegionThresholds {
  const tightened = criticalRegionsFor(sport).includes(region);
  return tightened
    ? { watch: TIGHT_WATCH_THRESHOLD, high: TIGHT_HIGH_THRESHOLD, tightened }
    : { watch: WATCH_THRESHOLD, high: HIGH_THRESHOLD, tightened };
}

// Band a value against a threshold pair (lower value = better).
export function bandFor(value: number, t: RegionThresholds): 'ok' | 'watch' | 'high' {
  if (value > t.high) return 'high';
  if (value > t.watch) return 'watch';
  return 'ok';
}

// The Elevated (high-band) cutoff for every indicator, in INDICATORS order —
// i.e. the same axis order the risk radar and the threshold strips use.
// Sport-critical regions come back tightened (thresholdsFor handles that), so
// this is the exact boundary line a radar "guide" polygon should be drawn
// against for this athlete. Single source of truth: any caller that needs a
// per-axis Elevated boundary (RiskRadar guide, PDF radar guide) should read
// it from here rather than re-deriving it.
export function highThresholdsFor(sport: string | undefined): number[] {
  return INDICATORS.map((ind) => thresholdsFor(sport, ind.region).high);
}

// Sport → regions that matter most for that sport. Defaults to no critical
// regions for unmapped sports (those still get a safety-net alert on any
// HIGH indicator). Curated for the seeded ISN sports; edit here to tune.
// Rationale is biomechanical (primary load/impact regions per sport).
export const SPORT_CRITICAL_REGIONS: Record<string, BodyRegion[]> = {
  Badminton: ['Shoulder', 'Knee', 'Ankle'],
  Swimming: ['Shoulder', 'Neck', 'Lumbar/Pelvis'],
  Diving: ['Shoulder', 'Spine', 'Lumbar/Pelvis'],
  Athletics: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Cycling: ['Knee', 'Lumbar/Pelvis', 'Neck'],
  Squash: ['Knee', 'Ankle', 'Shoulder'],
  Archery: ['Shoulder', 'Neck', 'Spine'],
  Bowling: ['Shoulder', 'Lumbar/Pelvis', 'Knee'],
  Bowls: ['Shoulder', 'Lumbar/Pelvis', 'Knee'],
  Karate: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Taekwondo: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Wushu: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Silat: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  'Pencak Silat': ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Gymnastics: ['Lumbar/Pelvis', 'Ankle', 'Shoulder'],
  Weightlifting: ['Lumbar/Pelvis', 'Knee', 'Shoulder'],
  Sailing: ['Lumbar/Pelvis', 'Shoulder', 'Neck'],
  Shooting: ['Neck', 'Shoulder', 'Spine'],
  Rugby: ['Knee', 'Shoulder', 'Neck'],
  Football: ['Knee', 'Ankle', 'Lumbar/Pelvis'],
  Hockey: ['Knee', 'Lumbar/Pelvis', 'Ankle'],
  Netball: ['Knee', 'Ankle', 'Shoulder'],
  'Sepak Takraw': ['Knee', 'Ankle', 'Lumbar/Pelvis'],
};

// Athlete.sport is free text (STRING(64)) — admins can type variants of the
// same sport. Normalise before lookup so "badminton", " Sepak takraw " or
// "Track & Field" still map to their curated region sets.
const normalizeSport = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Common variants → the canonical key in SPORT_CRITICAL_REGIONS.
const SPORT_ALIASES: Record<string, string> = {
  'running': 'Athletics',
  'track & field': 'Athletics',
  'track and field': 'Athletics',
  'sprinting': 'Athletics',
  'marathon': 'Athletics',
  'soccer': 'Football',
  'lawn bowls': 'Bowls',
  'weight lifting': 'Weightlifting',
  'ten-pin bowling': 'Bowling',
  'tenpin bowling': 'Bowling',
};

// Canonical map re-keyed by normalised name, built once at module load.
const REGIONS_BY_NORMALIZED: Record<string, BodyRegion[]> = Object.fromEntries(
  Object.entries(SPORT_CRITICAL_REGIONS).map(([name, regions]) => [normalizeSport(name), regions]),
);

export interface BodyPartAlert {
  region: BodyRegion;
  label: string;          // the indicator label (e.g. "Knee")
  value: number;          // the indicator value
  band: 'watch' | 'high';
  critical: boolean;      // region is sport-critical for this athlete
}

export interface ScreeningAlertResult {
  alerts: BodyPartAlert[];          // sorted worst-first
  criticalAlerts: BodyPartAlert[];  // just the sport-critical subset (same order)
  criticalRegions: BodyRegion[];    // the sport's critical regions (for display)
  topBand: 'none' | 'watch' | 'high';
  hasCriticalAlert: boolean;        // a sport-critical region is out of range
  hasData: boolean;                 // false when no screening has been ingested
}

export function criticalRegionsFor(sport: string | undefined): BodyRegion[] {
  if (!sport) return [];
  const norm = normalizeSport(sport);
  const canonical = SPORT_ALIASES[norm];
  return REGIONS_BY_NORMALIZED[canonical ? normalizeSport(canonical) : norm] ?? [];
}


// One-line follow-up for the banner, matched to severity. Copy stays neutral
// so the same line works for the athlete ("self") and staff views.
export function recommendedAction(result: ScreeningAlertResult, audience: 'self' | 'staff' = 'staff'): string {
  if (result.topBand === 'none') return '';
  if (result.topBand === 'high') {
    return audience === 'self'
      ? 'Raise this with your medical team before the next high-load session.'
      : 'Review before clearing the athlete for the next high-load session.';
  }
  return audience === 'self'
    ? 'Keep an eye on this region during training and mention it at your next screening.'
    : 'Monitor this region during training and recheck at the next screening.';
}

// Produce sport-aware alerts. Every indicator is banded against ITS region's
// sport-specific thresholds (thresholdsFor). An indicator is alerted when:
//   - its region is sport-critical AND it's out of the tightened bands, OR
//   - it's above its region's HIGH threshold regardless (safety net).
// Sorted so sport-critical + high severity float to the top.
export function computeBodyPartAlerts(
  risks: AthleteRisks | undefined | null,
  sport: string | undefined,
): ScreeningAlertResult {
  const criticalRegions = criticalRegionsFor(sport);
  const critSet = new Set<BodyRegion>(criticalRegions);
  const alerts: BodyPartAlert[] = [];
  let hasData = false;

  if (risks) {
    for (const ind of INDICATORS) {
      const raw = Number(risks[ind.key]);
      // Guard malformed ingestion values: non-finite/negative → treat as 0.
      const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
      // All-zero indicators mean no screening report has been ingested yet
      // (columns default to 0) — expose that so views can say "no data"
      // instead of implying a clean bill of health.
      if (value > 0) hasData = true;
      const t = thresholdsFor(sport, ind.region);
      const b = bandFor(value, t);
      if (b === 'ok') continue;
      const critical = critSet.has(ind.region);
      if (critical || b === 'high') {
        alerts.push({ region: ind.region, label: ind.label, value, band: b, critical });
      }
    }
  }

  // Worst-first: critical before non-critical, then high before watch, then value.
  alerts.sort((a, b) =>
    Number(b.critical) - Number(a.critical) ||
    (b.band === 'high' ? 1 : 0) - (a.band === 'high' ? 1 : 0) ||
    b.value - a.value,
  );

  const criticalAlerts = alerts.filter((a) => a.critical);
  const topBand: 'none' | 'watch' | 'high' = alerts.length
    ? (alerts.some((a) => a.band === 'high') ? 'high' : 'watch')
    : 'none';

  return {
    alerts,
    criticalAlerts,
    criticalRegions,
    topBand,
    hasCriticalAlert: criticalAlerts.length > 0,
    hasData,
  };
}
