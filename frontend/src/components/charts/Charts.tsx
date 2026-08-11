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
  points, lineLabel, valueLabel, height = 150, composition, compositionGrain, slope,
}: {
  points: PeriodPoint[];
  lineLabel?: string;
  valueLabel?: string;
  height?: number;
  /** The selection one grain finer — shown when there is only one period. */
  composition?: PeriodPoint[];
  compositionGrain?: string;
  /** Per-metric changes — the right chart for exactly two periods. */
  slope?: MetricDelta[];
}) {
  if (!points.length) return null;

  // ONE period is not a trend, and no chart makes a single point look like one.
  // Drawing a lone column with a "direction of travel" heading over it is the
  // chart equivalent of a shrug — this states the period's numbers and says
  // plainly that there is nothing to compare against yet.
  if (points.length === 1) {
    return (
      <SinglePeriod
        point={points[0]}
        lineLabel={lineLabel}
        valueLabel={valueLabel}
        composition={composition}
        compositionGrain={compositionGrain}
      />
    );
  }

  // Exactly two periods: the comparison IS the content, so lead with the metric
  // slopes and keep the throughput rows underneath as context.
  if (points.length === 2 && slope && slope.length) {
    return (
      <>
        <MetricDeltas
          metrics={slope}
          fromLabel={points[0].label}
          toLabel={points[1].label}
        />
        <div className="slope-throughput">
          <PeriodRows points={points} lineLabel={lineLabel} valueLabel={valueLabel} />
        </div>
      </>
    );
  }

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

// ══════════════════════════════════════════════════════════════════════════
// MetricDeltas — what CHANGED between exactly two periods.
//
// This replaced a slopegraph, which was the wrong chart and looked it. A
// slopegraph puts every metric on one vertical scale so the steeper line is the
// bigger move — but that only holds when the metrics are COMMENSURABLE, and these
// are not: Total Score, ROM, Stability and Symmetry cluster at 72-78, the overall
// indicator sits at ~50 by construction, and exercise risks live at ~18 on a
// scale that runs the other way. Forced onto one axis, the four movement scores
// collapsed into a few pixels of overlapping lines with unreadable labels. It was
// the same flattening already documented for the 0-100 score track, reintroduced.
//
// The values are incommensurable. The CHANGES are not — every delta here falls
// between -5.2 and +2.6 points. So plot the changes, on a shared delta axis with
// zero in the middle, and print the before/after as text where exact levels
// belong.
//
// Bar direction is the ORIENTED gain, so right is always better, on every row,
// including exercise risks where the raw number moves the other way. The printed
// delta keeps its true sign — the bar answers "better or worse", the number
// answers "by how much", and neither has to lie for the other.
// ══════════════════════════════════════════════════════════════════════════
export interface MetricDelta {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  /** False when a LOWER value is better (exercise risks). */
  higherBetter?: boolean;
  direction?: 'improving' | 'steady' | 'declining' | null;
  /**
   * A change that was averaged rather than measured between two readings — the
   * within-athlete case, where there is no single "from" and "to" to print
   * because every pair has its own. Supplying this instead of from/to gets the
   * same shared-scale bar without inventing endpoints that do not exist.
   */
  delta?: number | null;
  /** Replaces the "from → to" cell when the row has no endpoints to show. */
  vals?: string;
  /** Shown in place of the direction word — for stating WHY a row is flat. */
  note?: string;
}

const DELTA_TONE: Record<string, string> = {
  improving: 'var(--risk-low)',
  declining: 'var(--risk-high)',
  steady: 'var(--text-muted)',
};

export function MetricDeltas({
  metrics, fromLabel, toLabel, valsHead, note,
}: {
  metrics: MetricDelta[];
  fromLabel?: string;
  toLabel?: string;
  /** Heading for the middle column when the rows carry no from → to pair. */
  valsHead?: string;
  /** Replaces the standard explanation under the bars. */
  note?: React.ReactNode;
}) {
  const rows = metrics
    .filter((m) => (m.from !== null && m.to !== null) || m.delta !== null && m.delta !== undefined)
    .map((m) => {
      const delta = m.delta ?? +(((m.to as number) - (m.from as number)).toFixed(1));
      // Positive gain = better, whichever way the raw scale runs.
      const gain = (m.higherBetter ?? true) ? delta : -delta;
      return { ...m, delta, gain };
    })
    // Biggest movers first: the reader wants what changed, not the metric order.
    .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));

  if (!rows.length) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>Not enough data to compare these periods.</p>;

  const max = Math.max(...rows.map((r) => Math.abs(r.gain)), 1);

  return (
    <div className="mdelta">
      <div className="mdelta-head">
        <span className="mdelta-head-metric">Measure</span>
        <span className="mdelta-head-vals">{valsHead ?? `${fromLabel} → ${toLabel}`}</span>
        <span className="mdelta-head-chart">worse ← change → better</span>
      </div>
      {rows.map((r) => {
        const tone = DELTA_TONE[r.direction ?? 'steady'] ?? DELTA_TONE.steady;
        const pct = (Math.abs(r.gain) / max) * 50; // half-width each side of zero
        // Endpoints only exist for the two-period case. Resolved once so the
        // tooltip cannot format a null that the cell above it correctly skipped.
        const hasEnds = r.from !== null && r.from !== undefined && r.to !== null && r.to !== undefined;
        const valsText = r.vals ?? (hasEnds ? `${fmt(r.from as number)} → ${fmt(r.to as number)}` : '');
        return (
          <div className="mdelta-row" key={r.key}>
            <div className="mdelta-label">{r.label}</div>
            <div className="mdelta-vals">
              {r.vals !== undefined || !hasEnds ? (
                <span className="text-muted">{valsText}</span>
              ) : (
                <>{fmt(r.from as number)} <span className="mdelta-arrow">→</span> <b>{fmt(r.to as number)}</b></>
              )}
            </div>
            <div className="mdelta-track">
              <span className="mdelta-zero" aria-hidden />
              <span
                className="mdelta-bar"
                style={{
                  background: tone,
                  ...(r.gain >= 0
                    ? { left: '50%', width: `${pct}%` }
                    : { right: '50%', width: `${pct}%` }),
                }}
                title={`${r.label}${valsText ? `: ${valsText}` : ''} (${r.delta > 0 ? '+' : ''}${r.delta}, ${r.note ?? r.direction ?? 'steady'})`}
              />
            </div>
            <div className="mdelta-num" style={{ color: tone }}>
              {r.delta > 0 ? '+' : ''}{fmt(r.delta)}
            </div>
            <div className="mdelta-dir">{r.note ?? r.direction ?? 'steady'}</div>
          </div>
        );
      })}
      {note ?? (
        <p className="chart-note">
          Bars share one scale, so the longest is the biggest move. Direction is
          <strong> better or worse</strong>, not the sign — exercise risks improve by going down, so a fall
          there is drawn to the right like every other improvement, while the printed number keeps its
          true sign. &ldquo;Steady&rdquo; means the move is inside the noise band rather than exactly zero.
        </p>
      )}
    </div>
  );
}

// The one-period layout: the period's figures, and an explicit statement that
// there is nothing to compare them against.
function SinglePeriod({
  point, lineLabel, valueLabel, composition, compositionGrain,
}: {
  point: PeriodPoint;
  lineLabel?: string;
  valueLabel?: string;
  /** The same period broken down one grain finer. */
  composition?: PeriodPoint[];
  compositionGrain?: string;
}) {
  const segs = (point.segments ?? []).filter((s) => s.value > 0);
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="single-period">
      <div className="single-period-head">
        <div>
          <div className="single-period-label">{point.label}</div>
          <div className="single-period-value">
            {point.value}
            <span className="single-period-unit">{valueLabel ? ` ${valueLabel.toLowerCase()}` : ''}</span>
          </div>
        </div>
        {point.line != null && (
          <div className="single-period-line">
            <div className="single-period-line-val">{fmt(point.line)}</div>
            <div className="single-period-line-lbl">{lineLabel}</div>
          </div>
        )}
      </div>
      {segs.length > 0 && (
        <div className="single-period-bar">
          {segs.map((s) => (
            <span key={s.label} style={{ flex: `${s.value} 0 0`, background: s.color }} title={`${s.label}: ${s.value} of ${total}`} />
          ))}
        </div>
      )}
      {/* A single period has nothing to compare against, but it is MADE OF
          something. Showing the finer buckets inside it turns a dead panel into
          the breakdown the reader was about to go looking for anyway. */}
      {composition && composition.length > 1 && (
        <div className="single-period-comp">
          <div className="single-period-comp-head">
            What this {compositionGrain === 'quarter' ? 'year' : 'period'} is made of
          </div>
          <PeriodRows points={composition} valueLabel={valueLabel} lineLabel={lineLabel} />
        </div>
      )}
      <p className="chart-note" style={{ marginBottom: 0 }}>
        {composition && composition.length > 1
          ? `Only one ${compositionGrain === 'quarter' ? 'year' : 'period'} of screening falls in this selection, so there is no period-on-period change to report — the breakdown above is the same data one grain finer.`
          : 'Only one period of screening falls in this selection, so there is no change to report yet — choose a finer grain above for a breakdown.'}
      </p>
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
          <div className={`periodrow${p.value === 0 ? ' periodrow--empty' : ''}`} key={p.key}>
            <div className="periodrow-label">{p.label}</div>
            <div className="periodrow-track">
              {/* An empty period is drawn, not skipped — "nobody was screened this
                  month" is the finding, and a discrete axis hid it. */}
              {p.value === 0 && <span className="periodrow-none">no screening</span>}
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
// Heatmap — a matrix where BOTH axes are meaningful.
//
// For the HoloMotion subitem table, which is natively 5 regions × 5 measures.
// Every other chart here reduces that to a list; a matrix is the only shape that
// preserves it, and the report's own layout is a matrix, so this is the faithful
// rendering rather than a re-interpretation.
//
// Cells carry their VALUE as text as well as their colour — the colour is the
// scan, the number is the answer, and a colour-blind reader loses nothing.
// ══════════════════════════════════════════════════════════════════════════
export interface HeatCell { key: string; label: string; value: number | null }
export interface HeatRow { key: string; label: string; cells: HeatCell[] }

export function Heatmap({
  rows, colorFor, legend, rowHeader = 'Region',
}: {
  rows: HeatRow[];
  /** Cell background for a value — pass the shared tier colours, not a new ramp. */
  colorFor: (v: number) => string;
  legend?: ReactNode;
  rowHeader?: string;
}) {
  if (!rows.length) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No subitem scores for this selection.</p>;
  const cols = rows[0].cells;
  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {cols.map((c) => <th key={c.key} scope="col" className="num">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {r.cells.map((c) => (
                <td
                  key={c.key}
                  className="heatmap-cell"
                  style={c.value === null ? undefined : { background: colorFor(c.value) }}
                  title={`${r.label} · ${c.label}: ${c.value === null ? 'no reading' : c.value}`}
                >
                  {c.value === null ? <span className="heatmap-empty">—</span> : fmt(c.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {legend && <div className="heatmap-legend">{legend}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Scatter — one dot per athlete, two measures at once.
//
// Every other panel on the analytics page is an AVERAGE, and an average cannot
// show a squad splitting into two groups, or the single good mover who is
// carrying a high risk score. Quadrants split by the cohort medians turn that
// into a reading: the dangerous athlete is the one top-RIGHT — moves well, scored
// risky — because no single-number view will ever surface them.
// ══════════════════════════════════════════════════════════════════════════
export interface ScatterPoint {
  key: string; label: string; x: number; y: number; color?: string; hint?: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function Scatter({
  points, xLabel, yLabel, quadrants, height = 300,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  /** Labels for the four quadrants, clockwise from top-left. */
  quadrants?: [string, string, string, string];
  height?: number;
}) {
  if (!points.length) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No athletes with both measures in this selection.</p>;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = (lo: number, hi: number) => Math.max((hi - lo) * 0.12, 2);
  const xLo = Math.min(...xs) - pad(Math.min(...xs), Math.max(...xs));
  const xHi = Math.max(...xs) + pad(Math.min(...xs), Math.max(...xs));
  const yLo = Math.min(...ys) - pad(Math.min(...ys), Math.max(...ys));
  const yHi = Math.max(...ys) + pad(Math.min(...ys), Math.max(...ys));
  const mx = median(xs) as number;
  const my = median(ys) as number;

  const px = (v: number) => ((v - xLo) / (xHi - xLo || 1)) * 100;
  const py = (v: number) => 100 - ((v - yLo) / (yHi - yLo || 1)) * 100;

  const xTicks = [xLo, mx, xHi].map((v) => +v.toFixed(0));
  const yTicks = [yLo, my, yHi].map((v) => +v.toFixed(0));

  return (
    <div className="scatter">
      <div className="scatter-plot" style={{ height }}>
        {/* Median crosshair — quadrant boundaries that move with the cohort
            rather than fixed cut-offs, so "high risk" means high FOR THIS GROUP. */}
        <span className="scatter-cross scatter-cross--v" style={{ left: `${px(mx)}%` }} aria-hidden />
        <span className="scatter-cross scatter-cross--h" style={{ top: `${py(my)}%` }} aria-hidden />
        {quadrants && (
          <>
            <span className="scatter-quad" style={{ left: 6, top: 6 }}>{quadrants[0]}</span>
            <span className="scatter-quad" style={{ right: 6, top: 6, textAlign: 'right' }}>{quadrants[1]}</span>
            <span className="scatter-quad" style={{ right: 6, bottom: 6, textAlign: 'right' }}>{quadrants[2]}</span>
            <span className="scatter-quad" style={{ left: 6, bottom: 6 }}>{quadrants[3]}</span>
          </>
        )}
        {points.map((p) => (
          <span
            key={p.key}
            className="scatter-dot"
            style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%`, background: p.color ?? 'var(--series-1)' }}
            title={p.hint ?? `${p.label} — ${xLabel} ${fmt(p.x)}, ${yLabel} ${fmt(p.y)}`}
          />
        ))}
      </div>
      <div className="scatter-xaxis">
        {xTicks.map((t, i) => (
          <span key={t} style={{ left: `${px(t)}%`, transform: i === 0 ? 'none' : i === 2 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{t}</span>
        ))}
      </div>
      <div className="scatter-axislabels">
        <span>{xLabel} →</span>
        <span className="text-muted">
          median {fmt(mx)} / {fmt(my)} · {points.length} athletes
        </span>
      </div>
      <div className="scatter-yaxis" aria-hidden>
        {yTicks.map((t, i) => (
          <span key={t} style={{ top: `${py(t)}%`, transform: i === 2 ? 'none' : i === 0 ? 'translateY(-100%)' : 'translateY(-50%)' }}>{t}</span>
        ))}
      </div>
      <div className="scatter-ylabel">{yLabel} ↑</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Histogram — the SHAPE of a distribution, which every average destroys.
//
// A cohort mean of 50 is produced equally by everyone sitting on 50 and by half
// the squad at 30 and half at 70. Those are completely different squads and
// completely different decisions.
// ══════════════════════════════════════════════════════════════════════════
export function Histogram({
  values, min, max, binSize, markers = [], valueLabel, height = 170,
}: {
  values: number[];
  min: number;
  max: number;
  binSize: number;
  /** Vertical reference lines, e.g. band boundaries. */
  markers?: Array<{ at: number; label: string; color: string }>;
  valueLabel?: string;
  height?: number;
}) {
  if (!values.length) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No scored athletes in this selection.</p>;

  const binCount = Math.max(1, Math.ceil((max - min) / binSize));
  const bins = Array.from({ length: binCount }, (_, i) => ({
    lo: min + i * binSize,
    hi: min + (i + 1) * binSize,
    n: 0,
  }));
  for (const v of values) {
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / binSize)));
    bins[i].n += 1;
  }
  const peak = Math.max(1, ...bins.map((b) => b.n));
  const med = median(values) as number;
  const pos = (v: number) => ((v - min) / (max - min || 1)) * 100;

  return (
    <div className="histogram">
      <div className="histogram-plot" style={{ height }}>
        {markers.map((m) => (
          <span key={m.label} className="histogram-marker" style={{ left: `${pos(m.at)}%`, borderColor: m.color }} title={`${m.label} (${m.at})`} />
        ))}
        <div className="histogram-bars">
          {bins.map((b) => (
            <div
              key={b.lo}
              className="histogram-bar"
              style={{ height: `${(b.n / peak) * 100}%` }}
              title={`${b.lo}–${b.hi}${valueLabel ? ` ${valueLabel}` : ''}: ${b.n} athlete${b.n === 1 ? '' : 's'}`}
            >
              {b.n > 0 && <span className="histogram-n">{b.n}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="histogram-axis">
        {bins.filter((_, i) => i % 2 === 0).map((b) => (
          <span key={b.lo} style={{ left: `${pos(b.lo)}%` }}>{b.lo}</span>
        ))}
      </div>
      <div className="histogram-legend">
        {markers.map((m) => (
          <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 2, height: 12, background: m.color, display: 'inline-block' }} />
            {m.label}
          </span>
        ))}
        <span className="text-muted">median {fmt(med)} · {values.length} athletes · bin {binSize}</span>
      </div>
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
