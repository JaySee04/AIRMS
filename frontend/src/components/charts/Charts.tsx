'use client';

// Chart primitives for the two admin analytics pages. Plain SVG + CSS custom
// properties, so they follow the theme and add no dependency (Chart.js was
// retired from these pages on 2026-08-04 and is not coming back).
//
// WHY THESE SHAPES
// The pages they replace had six panels that were all the same shape — a bar, a
// stacked bar, a bar — which is why they read as a wall rather than a dashboard.
// Worse, two of them were actively misleading:
//
//   * average physical-quality scores (73.4 / 75.9 / 76.2 / 75.7) drawn on a
//     0-100 track are four visually identical bars. Which quality is weakest is
//     the only question that panel exists to answer, and it could not.
//   * per-indicator rows normalised to 100% cannot be compared to each other, so
//     "Ankle 13 elevated" vs "Neck 6" was legible only from the text at the end
//     of the row. The graphic was decoration.
//
// So: a zoomed dot plot for tightly-clustered scores, a shared-axis ranked bar
// for counts that must be compared, a real time series for periods, and rings
// for a single proportion. Every one still labels its values directly — meaning
// is never carried by colour alone.

import { ReactNode } from 'react';

// ── shared helpers ─────────────────────────────────────────────────────────
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Nice-ish round step for an axis covering `span`. */
function niceStep(span: number, target = 4): number {
  if (span <= 0) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// ══════════════════════════════════════════════════════════════════════════
// DotPlot — values that sit close together on a wide nominal scale.
//
// The axis is ZOOMED to the data (padded, clamped to the true bounds) and the
// real range is printed, because a zoomed axis exaggerates differences and the
// reader has to be told. A 0-100 track would render these four rows identically,
// which is the failure this replaces; a zoomed axis that hides its own zoom
// would be the opposite failure.
// ══════════════════════════════════════════════════════════════════════════
export interface DotRow { label: string; value: number | null; hint?: string }

export function DotPlot({
  rows, min = 0, max = 100, unit = '', reference, referenceLabel,
}: {
  rows: DotRow[];
  /** Hard bounds of the underlying scale — the zoom never exceeds these. */
  min?: number;
  max?: number;
  unit?: string;
  /** Optional comparison line, e.g. the institute average. */
  reference?: number | null;
  referenceLabel?: string;
}) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No data for this selection.</p>;

  const lo = Math.min(...vals, ...(reference != null ? [reference] : []));
  const hi = Math.max(...vals, ...(reference != null ? [reference] : []));
  // Pad by a quarter of the spread so dots never touch the ends, with a floor so
  // a single value (spread 0) still gets a sane window instead of a zero-width axis.
  const pad = Math.max((hi - lo) * 0.35, 2);
  const axisLo = Math.max(min, Math.floor(lo - pad));
  const axisHi = Math.min(max, Math.ceil(hi + pad));
  const span = axisHi - axisLo || 1;
  const pos = (v: number) => ((v - axisLo) / span) * 100;

  const step = niceStep(span);
  const ticks: number[] = [];
  for (let t = Math.ceil(axisLo / step) * step; t <= axisHi; t += step) ticks.push(+t.toFixed(6));

  return (
    <div className="dotplot">
      <div className="dotplot-rows">
        {rows.map((r) => (
          <div className="dotplot-row" key={r.label}>
            <div className="dotplot-label">{r.label}</div>
            <div className="dotplot-track">
              {ticks.map((t) => (
                <span key={t} className="dotplot-grid" style={{ left: `${pos(t)}%` }} aria-hidden />
              ))}
              {reference != null && (
                <span
                  className="dotplot-ref"
                  style={{ left: `${pos(reference)}%` }}
                  title={`${referenceLabel ?? 'Reference'}: ${fmt(reference)}${unit}`}
                  aria-hidden
                />
              )}
              {r.value !== null && (
                <>
                  {/* A stem from the axis floor to the dot: with four rows the
                      dots alone read as scattered points with no common origin. */}
                  <span className="dotplot-stem" style={{ width: `${pos(r.value)}%` }} aria-hidden />
                  <span
                    className="dotplot-dot"
                    style={{ left: `${pos(r.value)}%` }}
                    title={r.hint ?? `${r.label}: ${fmt(r.value)}${unit}`}
                  />
                </>
              )}
            </div>
            <div className="dotplot-value">{r.value === null ? '—' : fmt(r.value)}</div>
          </div>
        ))}
      </div>
      <div className="dotplot-axis">
        {ticks.map((t) => (
          <span key={t} className="dotplot-tick" style={{ left: `${pos(t)}%` }}>{fmt(t)}</span>
        ))}
      </div>
      <p className="chart-note">
        Axis zoomed to {fmt(axisLo)}–{fmt(axisHi)}{unit} of a {min}–{max} scale, so small
        differences are visible — read the printed values for absolute level.
        {reference != null && ` Dashed line = ${referenceLabel ?? 'reference'} (${fmt(reference)}${unit}).`}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// RankedBars — counts that must be COMPARED across rows, so every row shares
// one axis instead of being normalised to its own 100%.
// ══════════════════════════════════════════════════════════════════════════
export interface RankedRow {
  label: string;
  /** Drawn stacked left-to-right, in order, on the shared axis. */
  segments: Array<{ label: string; value: number; color: string }>;
  /** Right-hand callout. */
  note?: ReactNode;
  total?: number;
}

export function RankedBars({ rows, unit = '' }: { rows: RankedRow[]; unit?: string }) {
  const sums = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...sums);
  const step = niceStep(max, 4);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);

  return (
    <div className="ranked">
      {rows.map((r, i) => {
        const sum = sums[i];
        return (
          <div className="ranked-row" key={r.label}>
            <div className="ranked-label" title={r.label}>{r.label}</div>
            <div className="ranked-track">
              {ticks.map((t) => (
                <span key={t} className="ranked-grid" style={{ left: `${(t / max) * 100}%` }} aria-hidden />
              ))}
              <div className="ranked-bar" style={{ width: `${(sum / max) * 100}%` }}>
                {r.segments.filter((s) => s.value > 0).map((s) => (
                  <span
                    key={s.label}
                    style={{ flex: `${s.value} 0 0`, background: s.color }}
                    title={`${r.label} — ${s.label}: ${s.value}${unit}`}
                  />
                ))}
              </div>
            </div>
            <div className="ranked-note">{r.note ?? <strong>{sum}</strong>}</div>
          </div>
        );
      })}
      <div className="ranked-axis">
        {ticks.map((t) => (
          <span key={t} className="ranked-tick" style={{ left: `${(t / max) * 100}%` }}>{fmt(t)}</span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PeriodChart — throughput columns per period with an average-score line over
// them. Columns FLEX to fill the card but cap their width, so two periods look
// like two columns in a full-width chart rather than two lonely 62px stubs in a
// 1500px box (which is exactly how the old "Direction of travel" strip read).
// ══════════════════════════════════════════════════════════════════════════
export interface PeriodPoint {
  key: string;
  label: string;
  /** Bar height. */
  value: number;
  /** Optional stacked breakdown of `value` (band mix). */
  segments?: Array<{ label: string; value: number; color: string }>;
  /** Optional line series, on its own axis. */
  line?: number | null;
}

// Below this many periods, columns are the wrong idiom.
//
// A quarterly or yearly view of a young dataset is one or two periods. Drawn as
// columns that is two fat blocks with a canyon between them and a line crossing
// empty space — it reads as a chart that failed to load, which is exactly how the
// quarterly view looked while the monthly one (five or six periods) looked fine.
// Few periods become full-width ROWS instead: the same band mix and the same
// shared count axis, but the width is spent on the data rather than on gaps.
const COLUMN_MIN_POINTS = 4;

export function PeriodChart({
  points, lineLabel, valueLabel, height = 150,
}: {
  points: PeriodPoint[];
  lineLabel?: string;
  valueLabel?: string;
  height?: number;
}) {
  if (!points.length) return null;

  if (points.length < COLUMN_MIN_POINTS) {
    return <PeriodRows points={points} lineLabel={lineLabel} valueLabel={valueLabel} />;
  }
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const lineVals = points.map((p) => p.line).filter((v): v is number => v != null);
  const hasLine = lineVals.length >= 2;
  // The line gets its own zoomed axis: an average score of ~50 plotted against a
  // count axis topping out at 55 would sit mid-chart by coincidence and imply a
  // relationship between two unrelated quantities.
  const lLo = hasLine ? Math.min(...lineVals) : 0;
  const lHi = hasLine ? Math.max(...lineVals) : 1;
  const lPad = Math.max((lHi - lLo) * 0.6, 2);
  const lMin = lLo - lPad;
  const lMax = lHi + lPad;

  const n = points.length;
  const W = 1000;
  const H = height;
  const slot = W / n;
  // Wide bars, because this chart routinely renders TWO periods. At 55% of a
  // half-width slot they were 84px stubs sitting at 25% and 75% of a 1500px card
  // with a canyon between them — visually the same emptiness this replaced.
  const barW = Math.min(slot * 0.66, 190);
  const cx = (i: number) => slot * i + slot / 2;
  const ly = (v: number) => H - ((v - lMin) / (lMax - lMin || 1)) * H;

  const linePts = points
    .map((p, i) => (p.line == null ? null : `${cx(i)},${ly(p.line)}`))
    .filter((s): s is string => s !== null)
    .join(' ');

  return (
    <div className="periodchart">
      <div className="periodchart-plot" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="periodchart-svg" role="img"
          aria-label={`${valueLabel ?? 'Value'} per period${hasLine && lineLabel ? `, with ${lineLabel}` : ''}`}>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--chart-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {/* A baseline for the columns to stand on. Without it they hang in the
              card and the eye has no zero to read heights against. */}
          <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => {
            const h = (p.value / maxV) * (H - 4);
            const segs = (p.segments ?? []).filter((s) => s.value > 0);
            const segTotal = segs.reduce((s, x) => s + x.value, 0) || 1;
            let y = H;
            return (
              <g key={p.key}>
                {segs.length ? segs.map((s) => {
                  const sh = (s.value / segTotal) * h;
                  y -= sh;
                  return (
                    <rect key={s.label} x={cx(i) - barW / 2} y={y} width={barW} height={sh} fill={s.color}>
                      <title>{`${p.label} — ${s.label}: ${s.value}`}</title>
                    </rect>
                  );
                }) : (
                  <rect x={cx(i) - barW / 2} y={H - h} width={barW} height={h} fill="var(--series-2)">
                    <title>{`${p.label}: ${p.value}`}</title>
                  </rect>
                )}
              </g>
            );
          })}
          {hasLine && (
            <>
              <polyline points={linePts} fill="none" stroke="var(--brand-navy)" strokeWidth="2.5"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {points.map((p, i) => (p.line == null ? null : (
                <circle key={p.key} cx={cx(i)} cy={ly(p.line)} r="4.5" fill="var(--bg-card)"
                  stroke="var(--brand-navy)" strokeWidth="2.5" vectorEffect="non-scaling-stroke">
                  <title>{`${p.label} — ${lineLabel ?? 'value'}: ${fmt(p.line)}`}</title>
                </circle>
              )))}
            </>
          )}
        </svg>
        {/* Column totals as HTML, not SVG text: preserveAspectRatio="none"
            stretches the viewBox horizontally, which would distort glyphs.
            Positioned per column at the top of ITS OWN bar — a single row pinned
            above the plot left the numbers floating far from the short bars they
            described. */}
        {points.map((p, i) => (
          <span
            key={p.key}
            className="periodchart-top"
            style={{
              left: `${((i + 0.5) / n) * 100}%`,
              bottom: `${(p.value / maxV) * 100}%`,
            }}
          >
            {p.value}
          </span>
        ))}
      </div>
      <div className="periodchart-axis">
        {points.map((p) => (<span key={p.key}>{p.label}</span>))}
      </div>
    </div>
  );
}

// The few-periods layout: one full-width row per period.
//
// Bar length is the count on a SHARED axis, so 22 against 43 is visibly half —
// the comparison a two-column chart made you squint at. Segments are the band mix,
// so proportion and magnitude are both readable at width instead of competing for
// a 190px column.
//
// Deliberately no delta arrow: the callers already state the period-on-period
// change beneath the chart, using the API's own noise-banded verdict. A second,
// raw-sign delta here could disagree with it, which is the competing-verdicts
// problem that got ACWR pulled off the dashboards.
function PeriodRows({
  points, lineLabel, valueLabel,
}: { points: PeriodPoint[]; lineLabel?: string; valueLabel?: string }) {
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const anyLine = points.some((p) => p.line != null);
  // Newest last, matching the left-to-right reading of the column layout.
  return (
    <div className="periodrows">
      {points.map((p) => {
        const segs = (p.segments ?? []).filter((s) => s.value > 0);
        const segTotal = segs.reduce((s, x) => s + x.value, 0) || 1;
        return (
          <div className="periodrow" key={p.key}>
            <div className="periodrow-label">{p.label}</div>
            <div className="periodrow-track">
              <div className="periodrow-bar" style={{ width: `${(p.value / maxV) * 100}%` }}>
                {segs.length ? segs.map((s) => (
                  <span
                    key={s.label}
                    style={{ flex: `${s.value} 0 0`, background: s.color }}
                    title={`${p.label} — ${s.label}: ${s.value} of ${segTotal}`}
                  />
                )) : <span style={{ flex: 1, background: 'var(--series-2)' }} title={`${p.label}: ${p.value}`} />}
              </div>
            </div>
            <div className="periodrow-value">
              <strong>{p.value}</strong>
              <span className="periodrow-unit">{valueLabel ? ` ${valueLabel.toLowerCase()}` : ''}</span>
            </div>
            {anyLine && (
              <div className="periodrow-line" title={lineLabel}>
                {p.line == null ? <span className="text-muted">—</span> : fmt(p.line)}
              </div>
            )}
          </div>
        );
      })}
      {anyLine && lineLabel && (
        <p className="chart-note" style={{ marginTop: 6 }}>
          Bar length = {valueLabel ? valueLabel.toLowerCase() : 'value'} on a shared scale, split by band.
          Right-hand column is {lineLabel.toLowerCase()}.
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Ring — one proportion, big. For coverage ("58 of 62 screened"), where a bar
// buys nothing and a number alone buys no glance-value.
// ══════════════════════════════════════════════════════════════════════════
export function Ring({
  value, total, label, sublabel, color = 'var(--series-1)', size = 132,
}: {
  value: number; total: number; label: string; sublabel?: string; color?: string; size?: number;
}) {
  const pct = total > 0 ? value / total : 0;
  const r = 54;
  const circ = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size }}>
      <svg viewBox="0 0 128 128" width={size} height={size} role="img"
        aria-label={`${label}: ${value} of ${total} (${Math.round(pct * 100)}%)`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="13" />
        <circle
          cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
          // Start at 12 o'clock rather than 3, which is where a reader expects a
          // progress ring to begin.
          transform="rotate(-90 64 64)"
        />
        <text x="64" y="60" textAnchor="middle" className="ring-value">{value}</text>
        <text x="64" y="80" textAnchor="middle" className="ring-total">of {total}</text>
      </svg>
      <div className="ring-label">{label}</div>
      {sublabel && <div className="ring-sub">{sublabel}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DivergingBar — two opposed counts from a shared centre. "10 improved / 9
// declined" as two bars growing apart is instantly readable; the same numbers in
// two stat tiles are not compared by the eye at all.
// ══════════════════════════════════════════════════════════════════════════
export function DivergingBar({
  left, right, middle,
}: {
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
  middle?: { label: string; value: number };
}) {
  const max = Math.max(1, left.value, right.value);
  return (
    <div className="diverge">
      <div className="diverge-row">
        <div className="diverge-side diverge-side--l">
          <span className="diverge-count" style={{ color: left.color }}>{left.value}</span>
          <div className="diverge-track">
            <span style={{ width: `${(left.value / max) * 100}%`, background: left.color }} />
          </div>
        </div>
        <div className="diverge-axis" aria-hidden />
        <div className="diverge-side diverge-side--r">
          <div className="diverge-track">
            <span style={{ width: `${(right.value / max) * 100}%`, background: right.color }} />
          </div>
          <span className="diverge-count" style={{ color: right.color }}>{right.value}</span>
        </div>
      </div>
      <div className="diverge-legend">
        <span>{left.label}</span>
        {middle && <span className="text-muted">{middle.label} <strong>{middle.value}</strong></span>}
        <span>{right.label}</span>
      </div>
    </div>
  );
}
