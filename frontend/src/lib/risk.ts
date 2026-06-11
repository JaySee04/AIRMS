// AIRMS composite injury risk model.
//
// Base method: Acute:Chronic Workload Ratio (Gabbett, 2016) with the standard
// "sweet spot" 0.8–1.3 (empirically reaffirmed by Qin et al. 2025 meta-analysis
// at 56% lowest injury incidence) and danger zone >1.5. Internal load is
// computed from session RPE: Load (AU) = duration (min) × RPE, validated by
// Inoue et al. (2022) for scale reliability and Yang et al. (2024) for
// physiological correspondence.
//
// AIRMS contribution: ACWR bands are *personalised* per athlete using their
// screening data (injuryRiskIndex, overallActivityScore, mobility, stability,
// symmetry), and the resulting risk level is *escalated* when active injuries
// or a high muscle-flag count are present. This integrates the three data
// layers AIRMS stores (workload, biomechanical profile, injury history) into
// a single judgement instead of treating them as independent dashboards.

export type RiskCls = 'low' | 'mod' | 'high' | 'under';

export interface MuscleEntry {
  muscle: string;
  side: 'L' | 'R' | 'B';
}

export interface AthleteProfile {
  overallActivityScore?: number; // 0–100. Higher = better-conditioned.
  injuryRiskIndex?: number;      // 0–40 typical (seeded 8–35). Higher = more at risk.
  mobility?: number;             // 0–100. Higher is better.
  stability?: number;            // 0–100.
  symmetry?: number;             // 0–100.
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

// Pure ACWR-driven labels (no escalation applied).
const LEVEL_LABEL: Record<RiskCls, string> = {
  low: 'Low Risk',
  mod: 'Moderate Risk',
  high: 'High Risk',
  under: 'Detraining Risk',
};

// Compound labels — used only when classifyCompositeRisk escalates the band
// because active injuries or muscle flags align with the current workload.
// Only mod/high outcomes can be escalated, so only these two have compound forms.
const COMPOUND_LABEL: Partial<Record<RiskCls, string>> = {
  mod: 'Compound Moderate Risk',
  high: 'Compound High Risk',
};

const LEVEL_MSG: Record<RiskCls, string> = {
  low: 'Workload is balanced and within safe thresholds. Keep up your current routine.',
  mod: 'Your training load this week is trending higher than your baseline. Monitor recovery and avoid stacking high-intensity sessions.',
  high: 'Acute load is significantly above your baseline. Reduce intensity for the next 2–3 sessions and contact your medical staff if any symptoms appear.',
  under: 'Fitness at risk of declining. Your recent training is well below your usual baseline — check whether this is intentional rest or an unplanned drop.',
};

// Compound-outcome messages. These deliberately do NOT claim workload itself
// is elevated, because compound escalation can fire when the raw ACWR band
// was Low — the elevation comes from the combination with injury/biomech
// context, not workload alone.
const COMPOUND_MSG: Partial<Record<RiskCls, string>> = {
  mod: 'Workload by itself sits within safe ranges, but combining it with your current injury or biomechanical context elevates your overall risk. Monitor recovery closely and avoid stacking high-intensity sessions until the context clears.',
  high: 'Workload combined with active injury and biomechanical context places you at high risk. Reduce intensity for the next 2–3 sessions and confirm return-to-play criteria with your medical staff.',
};

// Vulnerability score from screening data. 0 = robust, 1 = highly vulnerable.
// Inputs are the five screening columns ISN actually captures per athlete:
//   - injuryRiskIndex          — ISN's direct injury-risk composite (heaviest weight)
//   - overallActivityScore     — composite conditioning score (deficit = poorer recoverability)
//   - mobility / stability / symmetry — movement-quality components
// Weights chosen so the two ISN-composite inputs together carry 0.50 (split
// 0.30 / 0.20 — injury-risk dominates), matching the original design where
// the composite layer carried half the score. The three movement-quality
// scores retain their 0.50 sum with the original split.
const IRI_MAX = 40; // normalization cap for injuryRiskIndex (seeded synthetic max 35)
export function computeVulnerability(a: AthleteProfile): number {
  const iri      = a.injuryRiskIndex      ?? 15;
  const overall  = a.overallActivityScore ?? 80;
  const iriNorm  = Math.max(0, Math.min(1, iri / IRI_MAX));
  const overDef  = Math.max(0, Math.min(1, 1 - overall / 100));
  const mobDef   = Math.max(0, Math.min(1, 1 - (a.mobility  ?? 80) / 100));
  const stbDef   = Math.max(0, Math.min(1, 1 - (a.stability ?? 80) / 100));
  const symDef   = Math.max(0, Math.min(1, 1 - (a.symmetry  ?? 80) / 100));
  return iriNorm * 0.30
       + overDef * 0.20
       + mobDef  * 0.20
       + stbDef  * 0.15
       + symDef  * 0.15;
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

  const escalated = cls !== baseCls;
  const level = escalated ? (COMPOUND_LABEL[cls] ?? LEVEL_LABEL[cls]) : LEVEL_LABEL[cls];
  const msg = escalated ? (COMPOUND_MSG[cls] ?? LEVEL_MSG[cls]) : LEVEL_MSG[cls];

  return {
    cls,
    baseCls,
    level,
    msg,
    factors,
    personalisedRange: thresholds,
    vulnerability: +vulnerability.toFixed(2),
    escalated,
  };
}
