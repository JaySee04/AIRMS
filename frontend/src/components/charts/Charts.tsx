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

import { useEffect, useRef, useState, ReactNode } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import HoverTip, { useHoverTip } from '@/components/ui/HoverTip';
import { median } from '@/lib/num';

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
  if (!vals.length) return <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No data for this selection.</p>;

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
        Axis zoomed to {fmt(axisLo)}–{fmt(axisHi)}{unit} of {min}–{max}. Read the printed
        values for absolute level.
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
// PeriodChart — band mix per period, with an average-score line on its own
// right-hand axis. Columns FLEX to fill the card but cap their width, so two
// periods draw as two broad columns rather than stubs with a canyon between.
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

// Columns serve every selection with something to compare (2+ periods).
//
// Switching chart idiom on the number of periods a filter happens to produce is
// a strong signal firing on nothing about the data — it made one card render
// four different graphics. The canyon that argued for a different layout at two
// periods is a WIDTH problem, handled at the width: `barW` caps and the slots
// flex.
//
// One period is still treated separately. That is not a threshold — there is
// genuinely nothing to compare.

/**
 * How the columns are scaled.
 *
 * `count` — height is athletes tested, read against a gridded axis.
 * `share` — every column full height, so the band MIX is compared like with like.
 *
 * Both are legitimate readings of the same data and each hides what the other
 * shows: counts make a light month look like a good one, shares make four
 * athletes look like thirty-three. Rather than pick, the chart shows both.
 */
export type PeriodMode = 'count' | 'share';

/** Seconds between automatic views, before the reader takes over. */
const ROTATE_MS = 10000;

/**
 * Axis ticks at a round step, so gridlines land on numbers a person would
 * choose. A bare max/4 gives ticks like 8.25, which is worse than no axis.
 */
function niceTicks(max: number, target = 4): { top: number; ticks: number[] } {
  const raw = Math.max(1, max) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag;
  // Headcounts are whole. Below ~8 the round-number step lands on 0.5, and an
  // axis reading "1.5 athletes" is worse than a coarse one.
  if (step < 1) step = 1;
  else if (!Number.isInteger(step)) step = Math.ceil(step);
  const top = Math.ceil(Math.max(1, max) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { top, ticks };
}

export function PeriodChart({
  points, lineLabel, valueLabel, composition, compositionGrain, slope,
  defaultMode = 'count', autoRotate = true,
}: {
  points: PeriodPoint[];
  lineLabel?: string;
  valueLabel?: string;
  /** The selection one grain finer — shown when there is only one period. */
  composition?: PeriodPoint[];
  compositionGrain?: string;
  /** Per-metric changes — the right chart for exactly two periods. */
  slope?: MetricDelta[];
  /** Which view opens. Counts, because that is the question asked first. */
  defaultMode?: PeriodMode;
  /** Cycle the two views until the reader chooses one. */
  autoRotate?: boolean;
}) {
  // Hooks first: this component has two early returns below, and React requires
  // the same hook order on every render regardless of which branch is taken.
  //
  // Same tooltip the body map uses, for the same reason: <title> is drawn by the
  // browser in the browser's own styling and follows neither the theme nor the
  // design scale. Converting only one of the two graphics would have left the
  // app visibly half-native.
  const { tip, show, hide } = useHoverTip();
  const tipHost = useRef<HTMLDivElement>(null);
  const onTip = (text: string) => (e: ReactMouseEvent) => show([text], tipHost.current, e.clientX, e.clientY);

  // Computed BEFORE the early returns and listed in the effect's deps. The effect
  // closes over it, and a const declared after a `return null` is never
  // initialised — the callback would then throw on an empty selection.
  //
  // The share view divides a column into its bands, so it needs bands. Programme
  // Activity plots test COUNTS with no segments at all: offered there, the toggle
  // rotated a page into one full-height grey block every 10 seconds under a
  // legend describing a mix that was not in the data.
  const canShare = points.some((p) => (p.segments ?? []).length > 0);

  const [mode, setMode] = useState<PeriodMode>(defaultMode);
  // Once the reader picks a view, it STAYS picked. Content that keeps moving
  // under someone who has chosen is the failure mode of every rotating panel.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || !autoRotate || !canShare) return undefined;
    // An automatically changing graphic is motion, and some readers have asked
    // the platform not to send them any (WCAG 2.3.3 / prefers-reduced-motion).
    // They get the default view and the toggle, which loses them nothing.
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setMode((m) => (m === 'count' ? 'share' : 'count')), ROTATE_MS);
    return () => clearInterval(t);
  }, [held, autoRotate, canShare]);

  const choose = (m: PeriodMode) => { setHeld(true); setMode(m); };

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

  // Exactly two periods still get the metric change chart — §26's point stands,
  // that with two the comparison IS the content and a pair of columns leaves the
  // reader to do the subtraction. It is now drawn BENEATH the columns instead of
  // in place of them, so the card keeps one primary graphic across every grain
  // and the comparison is an addition rather than a substitution.
  const isPair = points.length === 2 && !!slope && slope.length > 0;
  // Two scalings of one set of columns.
  //
  // Count answers "how much screening happened", share answers "how is the mix
  // moving", and each is invisible in the other: a count stack squashes a
  // 4-athlete month into a sliver where the mix cannot be read, and a share
  // stack draws that same month exactly as tall as a 33-athlete one. The
  // earlier chart picked counts and buried the mix; picking shares buried the
  // volume. Both are drawn, and the reader can hold either.
  const maxV = Math.max(...points.map((p) => p.value));
  const { top: axisTop, ticks } = niceTicks(maxV);
  const isShare = canShare && mode === 'share';
  // The caller's own noun. Hardcoding "Athletes tested" mislabelled Programme
  // Activity, which counts TESTS — an athlete screened twice is two of one and
  // one of the other.
  const countLabel = valueLabel ?? 'Athletes tested';
  // Gridlines are the point of the count view — without a scale to read heights
  // against, a column is decoration.
  const gridTicks = isShare ? [0, 25, 50, 75, 100] : ticks;
  const gridPct = (v: number) => (isShare ? v : (v / axisTop) * 100);

  const lineVals = points.map((p) => p.line).filter((v): v is number => v != null);
  const hasLine = lineVals.length >= 2;
  const lLo = hasLine ? Math.min(...lineVals) : 0;
  const lHi = hasLine ? Math.max(...lineVals) : 1;
  // Modest padding, and the range is PRINTED. The first version of this chart
  // padded by 60% and showed no axis at all, so the line's slope was an artefact
  // of an invisible scale — the one thing a trend line must never be.
  const lPad = Math.max((lHi - lLo) * 0.35, 1);
  const lMin = lLo - lPad;
  const lMax = lHi + lPad;

  const n = points.length;

  // Percentages, because the line shares the columns' plot box and that box is
  // sized in CSS. Its scale is its own and is LABELLED on the right: two series
  // may share a plot, but a series without an axis has a slope that is an
  // artefact of a scale the reader cannot see.
  const lyPct = (v: number) => 100 - ((v - lMin) / (lMax - lMin || 1)) * 100;
  const scoreTicks = hasLine ? [lMax, (lMin + lMax) / 2, lMin] : [];
  const linePct = points
    .map((p, i) => (p.line == null ? null : `${((i + 0.5) / n) * 100},${lyPct(p.line)}`))
    .filter((x): x is string => x !== null)
    .join(' ');

  return (
    <>
    <div className="periodchart" ref={tipHost}>
      <HoverTip tip={tip} />

      {canShare && (
        <div className="periodchart-modes">
          <div className="seg-group seg-group--sm" role="tablist" aria-label="Column scale">
            <button type="button" role="tab" aria-selected={!isShare}
              className={`seg-btn${!isShare ? ' active' : ''}`} onClick={() => choose('count')}>
              {countLabel}
            </button>
            <button type="button" role="tab" aria-selected={isShare}
              className={`seg-btn${isShare ? ' active' : ''}`} onClick={() => choose('share')}>
              Band mix %
            </button>
          </div>
          {/* Content that changes on its own must say so and must be stoppable
              (WCAG 2.2.2). The toggle is the stop, so the hint names it. */}
          {!held && autoRotate && (
            <span className="periodchart-rotating">switching every 10s &middot; click to hold</span>
          )}
        </div>
      )}

      <div className="periodchart-plotwrap">
        <div className="periodchart-yaxis" aria-hidden>
          {gridTicks.map((t) => (
            <span key={t} style={{ bottom: `${gridPct(t)}%` }}>{isShare ? `${t}%` : fmt(t)}</span>
          ))}
        </div>

        <div className="periodchart-grid">
          {gridTicks.map((t) => (
            <span key={t} className={t === 0 ? 'periodchart-gridline periodchart-gridline--base' : 'periodchart-gridline'}
              style={{ bottom: `${gridPct(t)}%` }} />
          ))}

          <div className="periodchart-mix">
            {points.map((p) => {
              const segs = (p.segments ?? []).filter((sg) => sg.value > 0);
              const total = segs.reduce((acc, sg) => acc + sg.value, 0) || 1;
              const colH = isShare ? 100 : (p.value / axisTop) * 100;
              return (
                <div className="periodchart-col" key={p.key}>
                  {p.value === 0 ? (
                    // Drawn, never skipped: for a screening programme a period
                    // with nobody in it IS the finding (§24), and it is the one
                    // column neither scaling has a height for.
                    <div className="periodchart-stack periodchart-empty" style={{ height: '100%' }}>
                      <span>no screening</span>
                    </div>
                  ) : (
                    <div className="periodchart-stack" style={{ height: `${colH}%` }}>
                      {segs.length ? segs.map((sg) => {
                        const pct = (sg.value / total) * 100;
                        const tipText = `${p.label} — ${sg.label}: ${sg.value} of ${total} (${Math.round(pct)}%)`;
                        return (
                          <span
                            key={sg.label}
                            style={{ flex: `${sg.value} 0 0`, background: sg.color }}
                            onMouseEnter={onTip(tipText)}
                            onMouseMove={onTip(tipText)}
                            onMouseLeave={hide}
                          >
                            {/* Colour alone must not carry the band (WCAG 1.4.1),
                                the same rule as every band label in AIRMS. */}
                            {pct >= 18 && colH >= 22 && <em>{isShare ? `${Math.round(pct)}%` : sg.value}</em>}
                          </span>
                        );
                      }) : (
                        <span style={{ flex: 1, background: 'var(--series-2)' }}
                          onMouseEnter={onTip(`${p.label}: ${p.value}`)}
                          onMouseMove={onTip(`${p.label}: ${p.value}`)}
                          onMouseLeave={hide} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* The score, over the same columns and on the same plot — but read
              against the right-hand axis, never the left. Drawn after the
              columns so it sits on top, and pointer-events off so it cannot
              steal the hover from the band it crosses. */}
          {hasLine && (
            <>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                className="periodchart-svg" role="img"
                aria-label={`${lineLabel ?? 'Average'} per period, ${fmt(lLo)} to ${fmt(lHi)}, right axis`}>
                <polyline points={linePct} fill="none" stroke="var(--brand-navy)" strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {points.map((p, i) => (p.line == null ? null : (
                <span
                  key={p.key}
                  className="periodchart-scoredot"
                  style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${lyPct(p.line)}%` }}
                  onMouseEnter={onTip(`${p.label} — ${lineLabel ?? 'value'}: ${fmt(p.line)}`)}
                  onMouseMove={onTip(`${p.label} — ${lineLabel ?? 'value'}: ${fmt(p.line)}`)}
                  onMouseLeave={hide}
                >
                  <em>{fmt(p.line)}</em>
                </span>
              )))}
            </>
          )}
        </div>

        {hasLine && (
          <div className="periodchart-yaxis periodchart-yaxis--right" aria-hidden>
            {scoreTicks.map((t) => (
              <span key={t} style={{ bottom: `${100 - lyPct(t)}%` }}>{fmt(t)}</span>
            ))}
          </div>
        )}
      </div>

      {/* The headcount rides on the x-axis rather than above its column: it must
          stay visible in the SHARE view, which by construction cannot encode it,
          and there is no room for a second label inside the plot. */}
      <div className={`periodchart-xaxis${hasLine ? '' : ' periodchart-xaxis--noright'}`}>
        {points.map((p) => (
          <span key={p.key}>
            {p.label}
            <em>{p.value}</em>
          </span>
        ))}
      </div>

      {/* One legend for a chart with two scales, saying which side each is read
          from. The zoom is DECLARED, as DotPlot declares its own: a zoomed axis
          exaggerates, and an undeclared one invites the reader to read a
          two-point move as a collapse. */}
      <div className="periodchart-legend">
        <span className="periodchart-key">
          <i className="periodchart-key-col" aria-hidden />
          {isShare ? 'Band mix, share of those tested' : countLabel}
          <em>left axis</em>
        </span>
        {hasLine && (
          <span className="periodchart-key">
            <i className="periodchart-key-line" aria-hidden />
            {lineLabel ?? 'Average'}
            <em>right axis &middot; {fmt(lMin)}&ndash;{fmt(lMax)}, zoomed, not from zero</em>
          </span>
        )}
      </div>
    </div>
    {isPair && slope && (
      <div style={{ marginTop: 'var(--sp-lg)' }}>
        <MetricDeltas metrics={slope} fromLabel={points[0].label} toLabel={points[1].label} />
      </div>
    )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MetricDeltas — what CHANGED between exactly two periods.
//
// Not a slopegraph: that needs COMMENSURABLE metrics and these are not. Total
// Score, ROM, Stability and Symmetry cluster at 72-78, the indicator sits at ~50
// by construction, exercise risks at ~18 on an inverted scale — on one axis the
// movement scores collapse into overlapping pixels.
//
// The values are incommensurable; the CHANGES are not (every delta here is
// between -5.2 and +2.6). So plot the changes on a shared delta axis with zero
// in the middle, and print before/after as text where exact levels belong.
//
// Bar direction is the ORIENTED gain, so right is always better — including
// exercise risks, where the raw number moves the other way. The printed delta
// keeps its true sign: the bar answers "better or worse", the number "by how
// much", and neither has to lie for the other.
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

  if (!rows.length) return <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>Not enough data to compare these periods.</p>;

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
          ? 'One period only, so no change to report. The breakdown above is the same data, one grain finer.'
          : 'One period only, so no change to report. Try a finer grain.'}
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
  if (!rows.length) return <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No subitem scores for this selection.</p>;
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

// median comes from lib/num — EXACT, and now the same function the backend
// uses, so a quadrant boundary cannot be drawn at 72.5 here and 73 there.

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
  if (!points.length) return <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No athletes with both measures in this selection.</p>;

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
  if (!values.length) return <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No scored athletes in this selection.</p>;

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
// Sparkline — one score's trajectory across an athlete's own screenings.
//
// SMALL MULTIPLES, NOT ONE CHART. Six scores on a shared 0-100 axis is the
// mistake this codebase has now made twice (DESIGN_DECISIONS §23 and §26): the
// movement scores cluster at 72-78, the indicator sits near 50 and exercise
// risks near 18 inverted, so overlaying them collapses four lines into a band
// of pixels and hides the very changes the chart exists to show. Each score
// gets its own panel and its own y-range instead, which is the standard
// treatment for non-commensurable series.
//
// Each panel is scaled to ITS OWN range, so the shape shows the athlete's
// movement at readable amplitude. That makes vertical position meaningless
// ACROSS panels, which is why every panel prints its own first and last value
// rather than relying on the reader to infer them from height.
// ══════════════════════════════════════════════════════════════════════════
export function Sparkline({
  points, higherBetter = true, width = 132, height = 34,
}: {
  /** Chronological, oldest first. Nulls are gaps, not zeroes. */
  points: Array<number | null>;
  higherBetter?: boolean;
  width?: number;
  height?: number;
}) {
  const real = points.filter((p): p is number => p !== null);
  if (real.length < 2) {
    return <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>needs 2+ screenings</span>;
  }

  const min = Math.min(...real);
  const max = Math.max(...real);
  // A flat series has no range to scale by; draw it down the middle rather than
  // dividing by zero and sending every point to infinity.
  const span = max - min || 1;
  const pad = 4;
  const stepX = (width - pad * 2) / (points.length - 1);
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  // Segments, so a missing screening leaves a gap instead of a straight line
  // implying a measurement that was never taken.
  const segs: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p === null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = []; return; }
    cur.push(`${pad + i * stepX},${yOf(p)}`);
  });
  if (cur.length > 1) segs.push(cur.join(' '));

  const first = real[0];
  const last = real[real.length - 1];
  const gain = higherBetter ? last - first : first - last;
  // Colour states the ORIENTED outcome, never the raw sign — exercise risks
  // improve by falling.
  const tone = gain > 0 ? 'var(--risk-low)' : gain < 0 ? 'var(--risk-high)' : 'var(--text-muted)';
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p !== null);

  return (
    <svg width={width} height={height} className="sparkline" role="img"
      aria-label={`${real.length} screenings, ${fmt(first)} to ${fmt(last)}`}>
      {segs.map((pts, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <polyline key={i} points={pts} fill="none" stroke={tone} strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <circle cx={pad + lastIdx * stepX} cy={yOf(last)} r="2.6" fill={tone} />
    </svg>
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
