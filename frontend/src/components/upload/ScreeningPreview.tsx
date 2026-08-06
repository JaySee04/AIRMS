'use client';

// Friendly read-out of an extracted HoloMotion report, shown in the import
// preview so the operator can review the numbers against the PDF BEFORE
// committing. Presents the same data the dashboards/PDF use — headline scores
// and the exercise-risk evaluation (banded Low / Watch / Elevated) — rather
// than a flat number table. Muscle flags AND the physical-fitness subitem
// scores (ROM/Stability per region) are both shown by the full-width BodyMap
// ("muscle hero") that the uploader renders beneath this panel — it toggles
// between the two rather than duplicating either here.

import { tierMeta } from '@/lib/holomotionTiers';

interface Props {
  athlete: Record<string, unknown>; // flat extracted scores (values read via num())
}

// Headline gauges (0–100, higher better) + Exercise Risks (lower better).
const HEADLINE: Array<[string, string, boolean]> = [
  ['overallActivityScore', 'Total Score', true],
  ['mobility', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['injuryRiskIndex', 'Exercise Risks', false],
];

// The seven shown exercise-risk indicators (LDH shown separately, muted).
const RISKS: Array<[string, string]> = [
  ['neckInjuryRisk', 'Neck Pain'],
  ['shoulderInjuryRisk', 'Shoulder Pain'],
  ['scoliosis', 'Scoliosis'],
  ['lumbarPelvisInjury', 'Anterior Pelvic Tilt'],
  ['jointPain', 'Joint Pain'],
  ['kneeInjuryRisk', 'Ligament Strain'],
  ['ankleInjuryRisk', 'Ankle Sprain'],
];

const RISK_AXIS = 40; // display axis — matches the dashboard strips

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Amber is a light yellow — white on it fails legibility, so filled amber
// marks take dark ink (same rule as pdfDraw.js BAND_INK).
const AMBER_INK = '#3d2f05';

// Exercise-risk band (lower is better): Low ≤15 · Watch ≤25 · Elevated >25.
function riskBand(v: number) {
  if (v > 25) return { label: 'Elevated', color: 'var(--risk-high)', onFill: '#fff' };
  if (v > 15) return { label: 'Watch', color: 'var(--risk-moderate)', onFill: AMBER_INK };
  return { label: 'Low', color: 'var(--risk-low)', onFill: '#fff' };
}

// Same tier source as the dashboards, so the operator verifies an import
// against the wording they will see afterwards.
const tier = tierMeta;

function Pill({ text, color, ink = '#fff' }: { text: string; color: string; ink?: string }) {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.02em',
      padding: '2px 8px', borderRadius: 999, color: ink, background: color, whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

export default function ScreeningPreview({ athlete }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Headline scores */}
      <div>
        <div className="screening-block-h">Headline scores</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
          {HEADLINE.map(([key, label, higherBetter]) => {
            const v = num(athlete[key]);
            const meta = v === null ? null : higherBetter ? tier(v) : riskBand(v);
            return (
              <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg-card)' }}>
                <div className="text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>{v ?? '—'}</div>
                {meta && <span style={{ fontSize: '0.68rem', fontWeight: 600, color: meta.color }}>{meta.label}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Exercise Risk Evaluation */}
      <div>
        <div className="screening-block-h">Exercise risk evaluation</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {[['Low', 'var(--risk-low)'], ['Watch', 'var(--risk-moderate)'], ['Elevated', 'var(--risk-high)']].map(([l, c]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />{l}
            </span>
          ))}
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>lower is better · scale 0–{RISK_AXIS}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {RISKS.map(([key, label]) => {
            const v = num(athlete[key]) ?? 0;
            const band = riskBand(v);
            const pct = Math.max(2, Math.min(100, (v / RISK_AXIS) * 100));
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem' }}>{label}</span>
                <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--bg)' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, borderRadius: 999, background: band.color }} />
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: '0.78rem', minWidth: 18, textAlign: 'right' }}>{v}</strong>
                  <Pill text={band.label} color={band.color} ink={band.onFill} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
