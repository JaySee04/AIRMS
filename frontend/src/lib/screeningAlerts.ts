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

// Each stored indicator → its region + a human label.
const INDICATORS: Array<{ key: keyof AthleteRisks; region: BodyRegion; label: string }> = [
  { key: 'neckInjuryRisk', region: 'Neck', label: 'Neck' },
  { key: 'shoulderInjuryRisk', region: 'Shoulder', label: 'Shoulder' },
  { key: 'scoliosis', region: 'Spine', label: 'Scoliosis' },
  { key: 'spinalDiscHerniation', region: 'Spine', label: 'Spinal disc' },
  { key: 'lumbarPelvisInjury', region: 'Lumbar/Pelvis', label: 'Lumbar / pelvis' },
  { key: 'jointPain', region: 'Joint', label: 'Joint pain' },
  { key: 'kneeInjuryRisk', region: 'Knee', label: 'Knee' },
  { key: 'ankleInjuryRisk', region: 'Ankle', label: 'Ankle' },
];

// Exercise-risk indicators are 0–40, lower is better. Bands mirror the medical
// dashboard's existing >15 "elevated" threshold.
export const WATCH_THRESHOLD = 15;
export const HIGH_THRESHOLD = 25;

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

export interface BodyPartAlert {
  region: BodyRegion;
  label: string;          // the indicator label (e.g. "Knee")
  value: number;          // the indicator value
  band: 'watch' | 'high';
  critical: boolean;      // region is sport-critical for this athlete
}

export interface ScreeningAlertResult {
  alerts: BodyPartAlert[];          // sorted worst-first
  criticalRegions: BodyRegion[];    // the sport's critical regions (for display)
  topBand: 'none' | 'watch' | 'high';
  hasCriticalAlert: boolean;        // a sport-critical region is out of range
}

export function criticalRegionsFor(sport: string | undefined): BodyRegion[] {
  if (!sport) return [];
  return SPORT_CRITICAL_REGIONS[sport] ?? [];
}

function bandOf(value: number): 'ok' | 'watch' | 'high' {
  if (value > HIGH_THRESHOLD) return 'high';
  if (value > WATCH_THRESHOLD) return 'watch';
  return 'ok';
}

// Produce sport-aware alerts. An indicator is alerted when:
//   - its region is sport-critical AND it's above the watch threshold, OR
//   - it's above the HIGH threshold regardless of sport (safety net).
// Sorted so sport-critical + high severity float to the top.
export function computeBodyPartAlerts(
  risks: AthleteRisks | undefined | null,
  sport: string | undefined,
): ScreeningAlertResult {
  const criticalRegions = criticalRegionsFor(sport);
  const critSet = new Set<BodyRegion>(criticalRegions);
  const alerts: BodyPartAlert[] = [];

  if (risks) {
    for (const ind of INDICATORS) {
      const value = Number(risks[ind.key] ?? 0);
      const b = bandOf(value);
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

  const hasCriticalAlert = alerts.some((a) => a.critical);
  const topBand: 'none' | 'watch' | 'high' = alerts.length
    ? (alerts.some((a) => a.band === 'high') ? 'high' : 'watch')
    : 'none';

  return { alerts, criticalRegions, topBand, hasCriticalAlert };
}
