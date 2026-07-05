'use client';

// HoloMotion screening snapshot for a single athlete. Renders only the data
// AIRMS currently ingests from the report: the five headline scores, the eight
// exercise-risk indicators (radar), and the muscle-flag body map. Shared by the
// athlete's own view and the medical per-athlete view.

import BodyMap, { MuscleEntry } from './BodyMap';
import RiskRadar from './RiskRadar';

export interface ScreeningAthlete {
  athleteId: string;
  name: string;
  sport?: string;
  age?: number;
  gender?: string;
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  risks: {
    neckInjuryRisk: number;
    shoulderInjuryRisk: number;
    scoliosis: number;
    spinalDiscHerniation: number;
    lumbarPelvisInjury: number;
    jointPain: number;
    kneeInjuryRisk: number;
    ankleInjuryRisk: number;
  };
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
}

const RISK_KEYS = [
  'neckInjuryRisk', 'shoulderInjuryRisk', 'scoliosis', 'spinalDiscHerniation',
  'lumbarPelvisInjury', 'jointPain', 'kneeInjuryRisk', 'ankleInjuryRisk',
] as const;
const RISK_LABELS = ['Neck', 'Shoulder', 'Scoliosis', 'Spinal Disc', 'Lumbar/Pelvis', 'Joint Pain', 'Knee', 'Ankle'];

// Band thresholds for the 0–100 quality scores (higher is better), matching the
// HoloMotion Excellent/Good/Average/Below-Average tiers.
function qualityBand(v: number): { label: string; color: string } {
  if (v >= 85) return { label: 'Excellent', color: 'var(--risk-low, #2e9e5b)' };
  if (v >= 75) return { label: 'Good', color: 'var(--risk-undertrained)' };
  if (v >= 60) return { label: 'Average', color: 'var(--risk-mod, #d99a16)' };
  return { label: 'Below Average', color: 'var(--risk-high, #d14b4b)' };
}

// Injury Risk Index is 0–40 and lower is better — invert the band logic.
function riskBand(v: number): { label: string; color: string } {
  if (v <= 15) return { label: 'Low Risk', color: 'var(--risk-low, #2e9e5b)' };
  if (v <= 25) return { label: 'Moderate', color: 'var(--risk-mod, #d99a16)' };
  return { label: 'High Risk', color: 'var(--risk-high, #d14b4b)' };
}

function ScoreGauge({ value, max, label, band }: { value: number | undefined; max: number; label: string; band: { label: string; color: string } }) {
  const has = value !== undefined && value !== null;
  const pct = has ? Math.max(0, Math.min(1, (value as number) / max)) : 0;
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 110 }}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={R} fill="none" stroke="var(--border, #e2e6ea)" strokeWidth="8" />
        <circle
          cx="46" cy="46" r={R} fill="none"
          stroke={has ? band.color : 'var(--border, #e2e6ea)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 46 46)"
        />
        <text x="46" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text, #1a2533)">
          {has ? value : '—'}
        </text>
        <text x="46" y="60" textAnchor="middle" fontSize="9" fill="var(--text-muted, #6b7280)">/ {max}</text>
      </svg>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>{label}</div>
      <div style={{ fontSize: '0.72rem', color: band.color, fontWeight: 600 }}>{has ? band.label : 'No data'}</div>
    </div>
  );
}

export default function ScreeningReport({ athlete }: { athlete: ScreeningAthlete }) {
  const riskValues = RISK_KEYS.map((k) => Math.min(30, Math.max(0, athlete.risks[k] ?? 0)));
  const hasAnyScore = [athlete.overallActivityScore, athlete.injuryRiskIndex, athlete.mobility, athlete.stability, athlete.symmetry]
    .some((v) => v !== undefined && v !== null);

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Scores</h2>
            <span className="card-sub">
              {athlete.name}{athlete.sport ? ` · ${athlete.sport}` : ''}
              {athlete.age ? ` · age ${athlete.age}` : ''}{athlete.gender ? ` · ${athlete.gender}` : ''}
            </span>
          </div>
        </div>
        {hasAnyScore ? (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'space-around' }}>
            <ScoreGauge value={athlete.overallActivityScore} max={100} label="Total Score" band={qualityBand(athlete.overallActivityScore ?? 0)} />
            <ScoreGauge value={athlete.mobility} max={100} label="ROM (Mobility)" band={qualityBand(athlete.mobility ?? 0)} />
            <ScoreGauge value={athlete.stability} max={100} label="Stability" band={qualityBand(athlete.stability ?? 0)} />
            <ScoreGauge value={athlete.symmetry} max={100} label="Symmetry" band={qualityBand(athlete.symmetry ?? 0)} />
            <ScoreGauge value={athlete.injuryRiskIndex} max={40} label="Exercise Risks" band={riskBand(athlete.injuryRiskIndex ?? 0)} />
          </div>
        ) : (
          <div className="empty-state">No screening scores on record yet.</div>
        )}
      </div>

      <div className="grid-2-1" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise Risk Indicators</h2>
              <span className="card-sub">Per body region · from latest screening</span>
            </div>
          </div>
          <RiskRadar labels={RISK_LABELS} values={riskValues} />
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Flags</h2>
              <span className="card-sub">Myodynamia &amp; tension</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <strong style={{ fontSize: '0.85rem' }}>Myodynamia ({athlete.myodynamia.length})</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {athlete.myodynamia.map((m, i) => <li key={i}>{m.muscle} <em>({m.side})</em></li>)}
                {!athlete.myodynamia.length && <li>None flagged</li>}
              </ul>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <strong style={{ fontSize: '0.85rem' }}>Tension ({athlete.tension.length})</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {athlete.tension.map((m, i) => <li key={i}>{m.muscle} <em>({m.side})</em></li>)}
                {!athlete.tension.length && <li>None flagged</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
            <span className="card-sub">L = left, R = right, B = both</span>
          </div>
        </div>
        <BodyMap myodynamia={athlete.myodynamia ?? []} tension={athlete.tension ?? []} />
      </div>
    </>
  );
}
