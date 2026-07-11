// Training focus — AIRMS' reflection of the HoloMotion report's closing
// "Training Prescription" section. The report ends every screening with
// per-day corrective exercise tables; AIRMS mirrors that pattern with a
// rule-based prescription derived from whichever indicators breached their
// sport-specific thresholds (lib/screeningAlerts.ts), worst regions first.
//
// The exercise vocabulary is taken verbatim from real HoloMotion Training
// Prescription tables (e.g. the ISN sample report, pages 11–12), so what the
// athlete sees here reads like the report they were handed. Deterministic and
// explainable by design — no model call; medical staff stay the authority.

import {
  AthleteRisks, BodyRegion, INDICATORS, criticalRegionsFor, thresholdsFor, bandFor,
} from './screeningAlerts';

interface Exercise {
  name: string;
  dose: string; // reps × sets · rest — the report's own table format
}

// Region → corrective exercises, drawn from the HoloMotion prescription
// vocabulary. Strength/activation work uses the report's 15–20 rep × 1 set
// dosing; stretches use its 30-rep/hold · short-rest dosing.
const REGION_EXERCISES: Record<BodyRegion, Exercise[]> = {
  'Neck': [
    { name: 'Neck Forward and Backward Movement', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Nodding and Looking Up', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Stand Front of The Neck Stretch', dose: '30s hold each side · rest 15s' },
  ],
  'Shoulder': [
    { name: 'Standing Shoulder Deep Activation', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Lateral Raise', dose: '20 reps × 1 set · rest 90s' },
    { name: 'Standing Shoulder Anterior Stretch', dose: '30s hold · rest 15s' },
  ],
  'Spine': [
    { name: 'Upper Back Stretch', dose: '30s hold · rest 15s' },
    { name: 'Spinal Rotation', dose: '30s hold each side · rest 15s' },
    { name: 'Kneeling Back Stretch', dose: '30s hold · rest 15s' },
  ],
  'Lumbar/Pelvis': [
    { name: 'Decubitus Prone Pelvic Tilt Exercise', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Hip Bridge Leg Swing', dose: '15 reps × 1 set · rest 90s' },
    { name: 'Crunch', dose: '15 reps × 1 set · rest 90s' },
  ],
  'Joint': [
    { name: 'Two-way Rotor', dose: '20 reps × 1 set · rest 90s' },
    { name: 'Alternating Palms Exercise', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Side-to-Side Shuffle', dose: '30 reps × 1 set · rest 60s' },
  ],
  'Knee': [
    { name: 'Chair Half Squat', dose: '15 reps × 1 set · rest 90s' },
    { name: 'Standing Leg Raise', dose: '20 reps × 1 set · rest 60s' },
    { name: 'Leg Lateral Bounds', dose: '20 reps × 1 set · rest 90s' },
  ],
  'Ankle': [
    { name: 'Side-to-Side Hops', dose: '30 reps × 1 set · rest 60s' },
    { name: 'Squat Jumps with Calf Raises', dose: '20 reps × 1 set · rest 90s' },
    { name: 'Straight Leg Front Kick', dose: '30 reps × 1 set · rest 15s' },
  ],
};

export interface TrainingFocusItem {
  region: BodyRegion;
  label: string;            // the indicator label that triggered this focus
  value: number;
  band: 'watch' | 'high';
  critical: boolean;        // sport-critical region (tightened thresholds)
  exercises: Exercise[];
}

// Build the corrective focus list. Unlike the alert banner (which is
// deliberately conservative), the prescription covers EVERY indicator that is
// out of its sport thresholds — the report itself prescribes for any
// Medium-Risk finding, not only the worst ones. Sorted sport-critical first,
// then severity, then value; de-duplicated by region (two spine indicators
// share one exercise block); capped at the three most pressing regions —
// matching the scale of the report's own day-plan.
//
// Ground-truth check: for the sample report (Badminton, Neck 23 / Ankle 19 /
// Knee 18 out of range) this yields Ankle + Knee + Neck — the same three
// problems the report's own summary flags ("neck pain, ankle sprain,
// ligament strain; Attention is advised to your training").
export function buildTrainingFocus(
  risks: AthleteRisks | undefined | null,
  sport: string | undefined,
): TrainingFocusItem[] {
  if (!risks) return [];
  const critSet = new Set<BodyRegion>(criticalRegionsFor(sport));

  const flagged: TrainingFocusItem[] = [];
  for (const ind of INDICATORS) {
    const raw = Number(risks[ind.key]);
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const band = bandFor(value, thresholdsFor(sport, ind.region));
    if (band === 'ok') continue;
    flagged.push({
      region: ind.region,
      label: ind.label,
      value,
      band,
      critical: critSet.has(ind.region),
      exercises: REGION_EXERCISES[ind.region] ?? [],
    });
  }

  flagged.sort((a, b) =>
    Number(b.critical) - Number(a.critical) ||
    (b.band === 'high' ? 1 : 0) - (a.band === 'high' ? 1 : 0) ||
    b.value - a.value,
  );

  const seen = new Set<BodyRegion>();
  const out: TrainingFocusItem[] = [];
  for (const f of flagged) {
    if (seen.has(f.region)) continue;
    seen.add(f.region);
    out.push(f);
    if (out.length === 3) break;
  }
  return out;
}
