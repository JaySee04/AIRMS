'use client';

// HoloMotion screening panel — the athlete's latest report, rendered around
// its thresholds rather than restated as numbers. Embedded directly in the
// athlete and medical dashboards (there is no separate screening page).
//
// Three blocks, each showing ONLY data the HoloMotion report carries:
//   1. Score gauges  — Total Score / ROM / Stability / Symmetry (0–100,
//      higher better, HoloMotion tier bands) + Exercise Risks (risk scale,
//      lower better).
//   2. Threshold strips — the eight per-region exercise-risk indicators as
//      bullet-style tracks with the OK / Watch / High zones tinted, a marker
//      at the athlete's value coloured by which zone it lands in, and the
//      athlete's sport-critical regions starred (same region map + thresholds
//      as the alert layer in lib/screeningAlerts.ts).
//   3. Muscle flags — the Myodynamia Deficiency / Muscle Tension lists as
//      side-tagged chips. The body-map figure stays a separate card on the
//      dashboards, so it is not duplicated here.

import {
  AthleteRisks, INDICATORS, WATCH_THRESHOLD, HIGH_THRESHOLD, criticalRegionsFor,
} from '@/lib/screeningAlerts';
import { MuscleEntry } from './BodyMap';

export interface ScreeningData {
  name: string;
  sport?: string;
  age?: number;
  gender?: string;
  overallActivityScore?: number | null;
  injuryRiskIndex?: number | null;
  mobility?: number | null;
  stability?: number | null;
  symmetry?: number | null;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
}

// Indicator display scale. The report prints Low 0–15 / Medium 16–55 /
// High 56–100, but AIRMS' ingested values live well under 40; clamping the
// track at 40 keeps the interesting range readable while the printed value
// stays exact.
const STRIP_MAX = 40;

// HoloMotion quality tiers for the 0–100 gauges (higher is better).
function qualityBand(v: number): { label: string; color: string } {
  if (v >= 85) return { label: 'Excellent', color: 'var(--risk-low, #2e9e5b)' };
  if (v >= 75) return { label: 'Good', color: 'var(--risk-undertrained)' };
  if (v >= 60) return { label: 'Average', color: 'var(--risk-mod, #d99a16)' };
  return { label: 'Below Average', color: 'var(--risk-high, #d14b4b)' };
}

// Risk bands for lower-is-better values (Exercise Risks gauge + indicators).
function riskBand(v: number): { label: string; color: string; cls: 'ok' | 'watch' | 'high' } {
  if (v > HIGH_THRESHOLD) return { label: 'High Risk', color: 'var(--risk-high, #d14b4b)', cls: 'high' };
  if (v > WATCH_THRESHOLD) return { label: 'Watch', color: 'var(--risk-mod, #d99a16)', cls: 'watch' };
  return { label: 'OK', color: 'var(--risk-low, #2e9e5b)', cls: 'ok' };
}

// Ring gauge with tier tick marks so the value is read against its
// thresholds, not just as a number. `ticks` are fractions of `max`.
function ScoreGauge({ value, max, label, band, ticks }: {
  value: number | null | undefined;
  max: number;
  label: string;
  band: { label: string; color: string };
  ticks: number[];
}) {
  const has = value !== undefined && value !== null;
  const pct = has ? Math.max(0, Math.min(1, (value as number) / max)) : 0;
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 108 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${label}: ${has ? value : 'no data'} of ${max}${has ? ` — ${band.label}` : ''}`}>
        <circle cx="46" cy="46" r={R} fill="none" stroke="var(--border, #e2e6ea)" strokeWidth="8" />
        <circle
          cx="46" cy="46" r={R} fill="none"
          stroke={has ? band.color : 'var(--border, #e2e6ea)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 46 46)"
        />
        {/* threshold ticks — where the tier boundaries sit on the ring */}
        {ticks.map((t) => {
          const ang = -90 + t * 360;
          const rad = (ang * Math.PI) / 180;
          const x1 = 46 + Math.cos(rad) * (R - 6);
          const y1 = 46 + Math.sin(rad) * (R - 6);
          const x2 = 46 + Math.cos(rad) * (R + 6);
          const y2 = 46 + Math.sin(rad) * (R + 6);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--bg-card, #fff)" strokeWidth="2" />;
        })}
        <text x="46" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text, #1a2533)">
          {has ? value : '—'}
        </text>
        <text x="46" y="60" textAnchor="middle" fontSize="9" fill="var(--text-muted, #6b7280)">/ {max}</text>
      </svg>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>{label}</div>
      <div style={{ fontSize: '0.72rem', color: has ? band.color : 'var(--text-muted)', fontWeight: 600 }}>
        {has ? band.label : 'No data'}
      </div>
    </div>
  );
}

// One bullet-style indicator strip: tinted OK/Watch/High zones + a marker at
// the value, coloured by the zone it lands in.
function IndicatorStrip({ label, value, critical }: { label: string; value: number; critical: boolean }) {
  const band = riskBand(value);
  const pos = Math.max(0, Math.min(1, value / STRIP_MAX)) * 100;
  const okW = (WATCH_THRESHOLD / STRIP_MAX) * 100;
  const watchW = ((HIGH_THRESHOLD - WATCH_THRESHOLD) / STRIP_MAX) * 100;
  return (
    <div
      className="screening-strip"
      title={`${label}: ${value.toFixed(0)} — ${band.label}${critical ? ' · critical region for this sport' : ''} (OK ≤ ${WATCH_THRESHOLD} · Watch ≤ ${HIGH_THRESHOLD} · High > ${HIGH_THRESHOLD})`}
    >
      <div className="screening-strip-label">
        {label}
        {critical && <span className="screening-strip-star" aria-label="sport-critical region">★</span>}
      </div>
      <div className="screening-strip-track" aria-hidden>
        <div className="screening-strip-zone screening-strip-zone--ok" style={{ width: `${okW}%` }} />
        <div className="screening-strip-zone screening-strip-zone--watch" style={{ width: `${watchW}%` }} />
        <div className="screening-strip-zone screening-strip-zone--high" style={{ width: `${100 - okW - watchW}%` }} />
        <div className={`screening-strip-marker screening-strip-marker--${band.cls}`} style={{ left: `${pos}%` }} />
      </div>
      <div className="screening-strip-value" style={{ color: band.color }}>
        {value.toFixed(0)}
        <span className="screening-strip-band">{band.label}</span>
      </div>
    </div>
  );
}

function MuscleChips({ title, entries, tone }: { title: string; entries: MuscleEntry[]; tone: 'myo' | 'tension' }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div className={`muscle-chip-title muscle-chip-title--${tone}`}>{title} ({entries.length})</div>
      {entries.length === 0 ? (
        <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>None flagged</div>
      ) : (
        <div className="muscle-chip-row">
          {entries.map((m, i) => (
            <span key={i} className={`muscle-chip muscle-chip--${tone}`}>
              {m.muscle}
              <span className="muscle-chip-side">{m.side}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScreeningPanel({ athlete }: { athlete: ScreeningData }) {
  const scores = [athlete.overallActivityScore, athlete.injuryRiskIndex, athlete.mobility, athlete.stability, athlete.symmetry];
  const hasReport = scores.some((v) => v !== undefined && v !== null);
  const criticalSet = new Set(criticalRegionsFor(athlete.sport));

  if (!hasReport) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening</h2>
            <span className="card-sub">Latest ingested report</span>
          </div>
        </div>
        <div className="empty-state">
          No HoloMotion screening has been ingested for this athlete yet. Reports are imported on the Data Uploading page.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Headline gauges — value read against HoloMotion's own tier boundaries */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening</h2>
            <span className="card-sub">
              Latest report · tier ticks at 60 / 75 / 85
              {athlete.age ? ` · age ${athlete.age}` : ''}{athlete.gender ? ` · ${athlete.gender}` : ''}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'space-around' }}>
          <ScoreGauge value={athlete.overallActivityScore} max={100} label="Total Score" band={qualityBand(athlete.overallActivityScore ?? 0)} ticks={[0.6, 0.75, 0.85]} />
          <ScoreGauge value={athlete.mobility} max={100} label="ROM (Mobility)" band={qualityBand(athlete.mobility ?? 0)} ticks={[0.6, 0.75, 0.85]} />
          <ScoreGauge value={athlete.stability} max={100} label="Stability" band={qualityBand(athlete.stability ?? 0)} ticks={[0.6, 0.75, 0.85]} />
          <ScoreGauge value={athlete.symmetry} max={100} label="Symmetry" band={qualityBand(athlete.symmetry ?? 0)} ticks={[0.6, 0.75, 0.85]} />
          <ScoreGauge value={athlete.injuryRiskIndex} max={STRIP_MAX} label="Exercise Risks" band={riskBand(athlete.injuryRiskIndex ?? 0)} ticks={[WATCH_THRESHOLD / STRIP_MAX, HIGH_THRESHOLD / STRIP_MAX]} />
        </div>
      </div>

      {/* Indicator threshold strips — the athlete's problems, placed on their thresholds */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise Risk Indicators — Thresholds</h2>
            <span className="card-sub">
              Marker shows the indicator on its risk zones · lower is better
              {criticalSet.size > 0 && athlete.sport ? <> · ★ critical regions for {athlete.sport}</> : null}
            </span>
          </div>
        </div>
        <div className="screening-strips">
          {INDICATORS.map((ind) => (
            <IndicatorStrip
              key={ind.key}
              label={ind.label}
              value={Math.max(0, Number(athlete.risks[ind.key] ?? 0))}
              critical={criticalSet.has(ind.region)}
            />
          ))}
        </div>
        <div className="screening-strip-legend">
          <span><span className="legend-swatch legend-swatch--ok" /> OK ≤ {WATCH_THRESHOLD}</span>
          <span><span className="legend-swatch legend-swatch--watch" /> Watch {WATCH_THRESHOLD + 1}–{HIGH_THRESHOLD}</span>
          <span><span className="legend-swatch legend-swatch--high" /> High &gt; {HIGH_THRESHOLD}</span>
          <span>★ sport-critical region</span>
        </div>
      </div>

      {/* Muscle flags — the report's two lists as side-tagged chips */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Flags</h2>
            <span className="card-sub">Myodynamia deficiency &amp; muscle tension · L = left, R = right, B = both</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <MuscleChips title="Myodynamia Deficiency" entries={athlete.myodynamia ?? []} tone="myo" />
          <MuscleChips title="Muscle Tension" entries={athlete.tension ?? []} tone="tension" />
        </div>
      </div>
    </>
  );
}
