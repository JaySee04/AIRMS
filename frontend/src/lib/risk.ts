// AIRMS composite injury risk model.
//
// Base method: Acute:Chronic Workload Ratio (Gabbett, 2016) with the standard
// "sweet spot" 0.8–1.3 and danger zone >1.5. Internal load is computed from
// session RPE (Foster et al., 2001): Load (AU) = duration (min) × RPE.
//
// AIRMS contribution: ACWR bands are *personalised* per athlete using their
// screening data (exerciseRiskScore, mobility, stability, symmetry), and the
// resulting risk level is *escalated* when active injuries or a high muscle-
// flag count are present. This integrates the three data layers AIRMS stores
// (workload, biomechanical profile, injury history) into a single judgement
// instead of treating them as independent dashboards.

export type RiskCls = 'low' | 'mod' | 'high' | 'under';

export interface MuscleEntry {
  muscle: string;
  side: 'L' | 'R' | 'B';
}

export interface AthleteProfile {
  exerciseRiskScore?: number; // 3–12 typical (seeded). Higher = more at risk.
  mobility?: number;          // 0–100. Higher is better.
  stability?: number;         // 0–100.
  symmetry?: number;          // 0–100.
  myodynamia?: MuscleEntry[];
  tension?: MuscleEntry[];
}

export interface InjuryRecord {
  recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic';
}

export interface CompositeRisk {
  cls: RiskCls;
  baseCls: RiskCls;
  level: string;
  msg: string;
  factors: string[];
  personalisedRange: { lowMin: number; lowMax: number; modMax: number };
  vulnerability: number; // 0–1, transparency value for the UI
  escalated: boolean;
}

const LEVEL_LABEL: Record<RiskCls, string> = {
  low: 'Optimal',
  mod: 'Elevated',
  high: 'High Risk',
  under: 'Low Workload',
};

const LEVEL_MSG: Record<RiskCls, string> = {
  low: 'Workload is balanced and within safe thresholds. Keep up your current routine.',
  mod: 'Your training load this week is trending higher than your baseline. Monitor recovery and avoid stacking high-intensity sessions.',
  high: 'Acute load is significantly above your baseline. Reduce intensity for the next 2–3 sessions and contact your medical staff if any symptoms appear.',
  under: 'Fitness at risk of declining. Your recent training is well below your usual baseline — check whether this is intentional rest or an unplanned drop.',
};

// Vulnerability score from screening data. 0 = robust, 1 = highly vulnerable.
// Weights chosen so exerciseRiskScore dominates (it is itself a composite) but
// raw mobility/stability/symmetry deficits also nudge the score.
export function computeVulnerability(a: AthleteProfile): number {
  const ers = a.exerciseRiskScore ?? 7.5;
  const ersNorm = Math.max(0, Math.min(1, (ers - 3) / 9));
  const mobDef = Math.max(0, Math.min(1, 1 - (a.mobility ?? 80) / 100));
  const stbDef = Math.max(0, Math.min(1, 1 - (a.stability ?? 80) / 100));
  const symDef = Math.max(0, Math.min(1, 1 - (a.symmetry ?? 80) / 100));
  return ersNorm * 0.5 + mobDef * 0.2 + stbDef * 0.15 + symDef * 0.15;
}

// Personalised ACWR thresholds. A vulnerability of 0.4 corresponds to the
// population baseline (0.8 / 1.3 / 1.5). Higher vulnerability tightens the
// optimal band; lower vulnerability widens it. The ±10–15% swing is small
// enough that the canonical literature thresholds still apply broadly.
export function personalisedThresholds(vulnerability: number) {
  // Clamp the modifier so the band can never invert (lowMin > lowMax) at
  // extreme vulnerability values. The ±15% swing matches the design intent.
  const raw = 1 + (vulnerability - 0.4) * 0.4;
  const factor = Math.max(0.85, Math.min(1.15, raw));
  return {
    lowMin: +(0.8 * factor).toFixed(2),
    lowMax: +(1.3 / factor).toFixed(2),
    modMax: +(1.5 / factor).toFixed(2),
  };
}

function classifyACWR(acwr: number, t: { lowMin: number; lowMax: number; modMax: number }): RiskCls {
  if (acwr > t.modMax) return 'high';
  if (acwr > t.lowMax) return 'mod';
  if (acwr >= t.lowMin) return 'low';
  return 'under';
}

function escalate(cls: RiskCls): RiskCls {
  if (cls === 'low') return 'mod';
  if (cls === 'mod') return 'high';
  return cls;
}

export function classifyCompositeRisk(
  acwr: number,
  athlete: AthleteProfile,
  activeInjuries: InjuryRecord[],
): CompositeRisk {
  const vulnerability = computeVulnerability(athlete);
  const thresholds = personalisedThresholds(vulnerability);
  const baseCls = classifyACWR(acwr, thresholds);

  const factors: string[] = [];
  let cls = baseCls;

  const injuryCount = activeInjuries.length;
  if (injuryCount > 0 && (baseCls === 'mod' || (baseCls === 'low' && acwr > 1.0))) {
    factors.push(`${injuryCount} active injury record${injuryCount > 1 ? 's' : ''}`);
    cls = escalate(cls);
  }

  const muscleFlagCount = (athlete.myodynamia?.length ?? 0) + (athlete.tension?.length ?? 0);
  if (muscleFlagCount >= 5 && (cls === 'mod' || (cls === 'low' && acwr > 1.1))) {
    factors.push(`${muscleFlagCount} muscle flag${muscleFlagCount > 1 ? 's' : ''} from screening`);
    cls = escalate(cls);
  }

  return {
    cls,
    baseCls,
    level: LEVEL_LABEL[cls],
    msg: LEVEL_MSG[cls],
    factors,
    personalisedRange: thresholds,
    vulnerability: +vulnerability.toFixed(2),
    escalated: cls !== baseCls,
  };
}
