'use client';

// HoloMotion screening panel — the athlete's latest report, rendered around
// its thresholds rather than restated as numbers. Embedded directly in the
// athlete and medical dashboards (there is no separate screening page).
//
// Two blocks, each showing ONLY data the HoloMotion report carries:
//   1. Score gauges  — Total Score / ROM / Stability / Symmetry (0–100,
//      higher better, HoloMotion tier bands) + Exercise Risks (risk scale,
//      lower better).
//   2. Threshold strips — the eight per-region exercise-risk indicators as
//      bullet-style tracks with the OK / Watch / High zones tinted, a marker
//      at the athlete's value coloured by which zone it lands in, and the
//      athlete's sport-critical regions starred (same region map + thresholds
//      as the alert layer in lib/screeningAlerts.ts).
// The report's muscle lists AND the Physical Fitness Subitem Score (ROM /
// Stability per region) are NOT rendered here — the BodyMap card that sits
// next to this panel on both dashboards shows both, toggled between "Muscle
// Flags" and "ROM & Stability" on the same figure, so repeating either here
// would be noise.

import { tierMeta } from '@/lib/holomotionTiers';
import {
  AthleteRisks, BAND_LABEL, INDICATORS, WATCH_THRESHOLD, HIGH_THRESHOLD,
  TIGHT_WATCH_THRESHOLD, TIGHT_HIGH_THRESHOLD,
  RegionThresholds, thresholdsFor, bandFor, criticalRegionsFor,
} from '@/lib/screeningAlerts';
import { buildTrainingFocus } from '@/lib/trainingFocus';
import type { Subitems } from './OverallRiskBadge';

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
  // Display-only detail (not part of z-scoring) — not stored on the Athlete
  // row, so callers pull these from the athlete's `.screening` sub-object.
  subitems?: Subitems | null;
}

// Indicator display scale. The report prints Low 0–15 / Medium 16–55 /
// High 56–100, but AIRMS' ingested values live well under 40; clamping the
// track at 40 keeps the interesting range readable while the printed value
// stays exact.
const STRIP_MAX = 40;

// HoloMotion quality tiers for the 0–100 gauges — shared with the subitem
// table rendered beneath and the body map beside (lib/holomotionTiers.ts).
const qualityBand = tierMeta;

// Presentation for a lower-is-better band (Exercise Risks gauge + indicators).
// Words come from BAND_LABEL so the strips, the alert banner, the admin cohort
// chart and the PDF reports all describe the same number identically. Note
// "Elevated", not "High" — the report reserves High for 56–100. See the band
// vocabulary note in lib/screeningAlerts.ts.
const BAND_META = {
  ok: { label: BAND_LABEL.ok, color: 'var(--risk-low)' },
  watch: { label: BAND_LABEL.watch, color: 'var(--risk-moderate)' },
  high: { label: BAND_LABEL.high, color: 'var(--risk-high)' },
} as const;

// The overall Exercise Risks gauge is banded on the instrument's own scale —
// it has no body region, so sport tightening doesn't apply to it.
const INSTRUMENT_BANDS: RegionThresholds = { watch: WATCH_THRESHOLD, high: HIGH_THRESHOLD, tightened: false };

function riskBand(v: number, t: RegionThresholds = INSTRUMENT_BANDS) {
  const cls = bandFor(v, t);
  return { cls, ...BAND_META[cls] };
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
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, textAlign: 'center' }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-xs)', color: has ? band.color : 'var(--text-muted)', fontWeight: 600 }}>
        {has ? band.label : 'No data'}
      </div>
    </div>
  );
}

// One bullet-style indicator strip: tinted OK/Watch/High zones sized by THIS
// region's sport-specific thresholds, + a marker at the value coloured by the
// zone it lands in. Sport-critical regions show visibly shorter OK/Watch
// zones — the tightened standard is drawn, not just annotated.
function IndicatorStrip({ label, value, t }: { label: string; value: number; t: RegionThresholds }) {
  const band = riskBand(value, t);
  const pos = Math.max(0, Math.min(1, value / STRIP_MAX)) * 100;
  const okW = (t.watch / STRIP_MAX) * 100;
  const watchW = ((t.high - t.watch) / STRIP_MAX) * 100;
  return (
    <div
      className="screening-strip"
      role="img"
      aria-label={`${label}: ${value.toFixed(0)} — ${band.label}. Thresholds: Low up to ${t.watch}, Watch up to ${t.high}, Elevated above ${t.high}${t.tightened ? ' (tightened — critical region for this sport)' : ''}`}
      title={`${label}: ${value.toFixed(0)} — ${band.label} (Low ≤ ${t.watch} · Watch ≤ ${t.high} · Elevated > ${t.high}${t.tightened ? ' — tightened: critical region for this sport' : ''})`}
    >
      <div className="screening-strip-label">
        {label}
        {t.tightened && <span className="screening-strip-star" aria-label="sport-critical region — tightened thresholds">★</span>}
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

// `showTrainingFocus` — the corrective-exercise block is useful to the athlete
// (and coach), but redundant on the medical view (the people who actually
// prescribe rehab), so the medical dashboard turns it off.
export default function ScreeningPanel({
  athlete, showTrainingFocus = true, historical = false,
}: { athlete: ScreeningData; showTrainingFocus?: boolean; historical?: boolean }) {
  const scores = [athlete.overallActivityScore, athlete.injuryRiskIndex, athlete.mobility, athlete.stability, athlete.symmetry];
  const hasReport = scores.some((v) => v !== undefined && v !== null);
  const criticalSet = new Set(criticalRegionsFor(athlete.sport));

  if (!hasReport) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening</h2>
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
              Tier ticks at 60 / 75 / 85
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

      {/* Indicator threshold strips — the athlete's problems, placed on
          their SPORT'S thresholds. Same eight tests for everyone; the zones
          each test is judged against depend on the sport. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise Risk Indicators — Sport Thresholds</h2>
            <span className="card-sub">
              Marker shows the indicator on its risk zones · lower is better
              {criticalSet.size > 0 && athlete.sport
                ? <> · thresholds personalised for {athlete.sport}</>
                : null}
            </span>
          </div>
        </div>
        <div className="screening-strips">
          {INDICATORS.map((ind) => (
            <IndicatorStrip
              key={ind.key}
              label={ind.label}
              value={Math.max(0, Number(athlete.risks[ind.key] ?? 0))}
              t={thresholdsFor(athlete.sport, ind.region)}
            />
          ))}
        </div>
        <div className="screening-strip-legend">
          <span><span className="legend-swatch legend-swatch--ok" /> {BAND_LABEL.ok}</span>
          <span><span className="legend-swatch legend-swatch--watch" /> {BAND_LABEL.watch}</span>
          <span><span className="legend-swatch legend-swatch--high" /> {BAND_LABEL.high}</span>
          <span>standard bands ≤{WATCH_THRESHOLD} / ≤{HIGH_THRESHOLD}</span>
          <span>★ sport-critical — tightened to ≤{TIGHT_WATCH_THRESHOLD} / ≤{TIGHT_HIGH_THRESHOLD}</span>
          <span className="text-muted">
            Report prints Low 0–15 · Medium 16–55; AIRMS splits Medium into Watch / Elevated
          </span>
        </div>
      </div>

      {/* Physical Fitness Subitem Score — 5-region ROM/Stability/Symmetry
          breakdown. No longer a standalone card here: it's shown by the
          "Muscle Assessment Map" BodyMap elsewhere on this page, toggled
          between "Muscle Flags" and "ROM & Stability" — same figure, same
          data, one fewer place for the two to drift apart. */}

      {/* Training focus — AIRMS' counterpart of the report's closing Training
          Prescription: corrective exercises for the regions that breached
          their sport thresholds, worst first. */}
      {showTrainingFocus && <TrainingFocus athlete={athlete} historical={historical} />}
    </>
  );
}

// In the history views this is a RECORD of what the screening indicated, not a
// programme to follow: the corrective work is derived from readings that have
// since been superseded. So the heading, the empty state and the footnote all
// stop instructing, rather than the block being hidden — "what did that screening
// say to work on" is a fair question to ask of history.
function TrainingFocus({ athlete, historical = false }: { athlete: ScreeningData; historical?: boolean }) {
  const focus = buildTrainingFocus(athlete.risks, athlete.sport);
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            {historical ? 'Training Focus at This Screening' : 'Training Focus'}
          </h2>
          <span className="card-sub">
            {historical
              ? 'Corrective work indicated by the regions out of range at this screening'
              : 'Corrective work for out-of-range regions'}
          </span>
        </div>
      </div>
      {focus.length === 0 ? (
        <div className="empty-state">
          {historical
            ? 'All indicators were within their sport thresholds at this screening.'
            : 'All indicators are within their sport thresholds — maintain the current programme and reassess at the next screening.'}
        </div>
      ) : (
        <>
          <div className="focus-grid">
            {focus.map((f) => (
              <div key={f.region} className={`focus-block focus-block--${f.band}`}>
                <div className="focus-block-head">
                  <span className="focus-block-region">
                    {f.label}{f.critical && <span className="screening-strip-star" aria-label="sport-critical region"> ★</span>}
                  </span>
                  <span className={f.band === 'high' ? 'badge-high' : 'badge-moderate'}>
                    {BAND_LABEL[f.band]} · {f.value.toFixed(0)}
                  </span>
                </div>
                <ul className="focus-exercises">
                  {f.exercises.map((e) => (
                    <li key={e.name}>
                      <span className="focus-exercise-name">{e.name}</span>
                      <span className="focus-exercise-dose">{e.dose}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 12, marginBottom: 0 }}>
            Derived from the flagged screening indicators using the HoloMotion prescription exercise vocabulary.
            {historical
              ? ' This reflects the screening selected above, not current guidance — work from the latest screening before changing anything.'
              : ' Informational — confirm with medical staff before changing the training programme.'}
          </p>
        </>
      )}
    </div>
  );
}
