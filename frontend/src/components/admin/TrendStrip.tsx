'use client';

// Direction of travel for the filtered population — the one thing the Screening
// Analytics dashboard could not answer.
//
// Every other panel on that page is a SNAPSHOT: this is the band mix now, these
// are the average scores now. Whether any of it is getting better or worse was
// only answerable by leaving for Programme Activity. This puts the direction on
// the page you are already looking at.
//
// Deliberately a SUMMARY, not a second copy of that page. JC split the two
// surfaces on purpose — one answers "how is the squad?", the other "how is the
// screening programme run?" — so this shows the last few periods and links
// across rather than reproducing throughput, coverage and retest analysis here.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GRAINS, type Grain } from '@/lib/periods';
import { PeriodChart } from '@/components/charts/Charts';
import { BANDS, BAND_COLOR, BAND_SHORT } from '@/lib/bands';


// Mirrors GET /athletes/analytics/periods. Everything past `bands` is marked
// optional because it genuinely can be absent — and because the previous
// version of this file declared a field the API does not send (`avg` instead of
// `averages`), which TypeScript happily accepted and the browser did not.
interface Delta {
  delta: number;
  higherBetter: boolean;
  direction: 'improving' | 'steady' | 'declining';
}
interface Period {
  key: string;
  label: string;
  tests: number;
  athletes: number;
  retestedWithin?: number;
  bands: { green: number; amber: number; red: number; none: number };
  averages?: Record<string, number | null>;
  // The API computes direction itself, including whether higher is better for
  // each metric — recomputing that here would be a second opinion to keep in
  // sync, so it is read rather than derived.
  deltas?: Record<string, Delta | undefined>;
  direction?: string;
}
interface PeriodsResponse {
  grain: Grain;
  periods: Period[];
  grainCounts?: Record<Grain, number>;
  composition?: { grain: Grain; periods: Period[] } | null;
}

// The metrics compared when a selection has exactly two periods. The boolean is
// `higherBetter` — exercise risks is the one that runs the other way, and getting
// it wrong would draw a rise in injury risk as an improvement.
const COMPARED_METRICS: Array<[string, string, boolean]> = [
  ['overallIndicator', 'Indicator', true],
  ['totalScore', 'Total Score', true],
  ['rom', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['exerciseRisks', 'Exercise risks', false],
];



// How many periods fit before this stops being a summary and starts being the
// Programme Activity page.
const SHOWN = 6;

// Band names + colours come from lib/bands.ts. This file used to declare its own
// and called the red band "Immediate" while the risk hero called it "Immediate
// assessment" — one clinical state, two names, on screens seen side by side.
const BAND_TOKENS = BANDS.map((key) => ({ key, label: BAND_SHORT[key], color: BAND_COLOR[key] }));

export default function TrendStrip({ query }: { query: string }) {
  const [grain, setGrain] = useState<Grain>('quarter');
  const [data, setData] = useState<PeriodsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    const q = new URLSearchParams(query);
    q.set('grain', grain);
    api.get<PeriodsResponse>(`/athletes/analytics/periods?${q.toString()}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load trend'); });
    return () => { cancelled = true; };
  }, [query, grain]);

  const periods = (data?.periods ?? []).slice(-SHOWN);
  const latest = periods.length ? periods[periods.length - 1] : null;

  // Direction on the headline score, straight from the API.
  const prev = periods.length >= 2 ? periods[periods.length - 2] : null;
  const avgTotal = latest?.averages?.totalScore;
  const d = latest?.deltas?.totalScore;
  const delta = d && typeof d.delta === 'number' ? d.delta : null;
  // Colour by the API's OWN verdict, not by the sign. It classifies small moves
  // as "steady", and painting a -1.3 red because it is negative reports noise as
  // a decline. This also gets Exercise Risks right for free, where improving
  // means going DOWN (the API tracks that as higherBetter).
  const tone = d?.direction === 'improving' ? 'var(--risk-low)'
    : d?.direction === 'declining' ? 'var(--risk-high)'
      : 'var(--text-muted)';

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Direction of travel</h2>
          <span className="card-sub">
            Band mix per period as a share of who was tested, for the current filters.
          </span>
        </div>
        {/* Each grain carries how many periods it would draw. The quarterly and
            yearly views of a young dataset are two points and one — that is a
            property of the data, not of the chart, and saying so up front beats
            rendering an apology after the click. A grain with no periods at all
            is disabled rather than offered. */}
        <div className="seg-group" role="tablist" aria-label="Trend period">
          {GRAINS.map((g) => {
            const count = data?.grainCounts?.[g.key];
            return (
              <button
                key={g.key}
                type="button"
                className={`seg-btn${grain === g.key ? ' active' : ''}`}
                aria-pressed={grain === g.key}
                disabled={count === 0}
                title={count === undefined ? undefined
                  : count === 0 ? 'No screening periods in this selection'
                    : `${count} ${g.label.replace('ly', '').toLowerCase()}${count === 1 ? '' : 's'} of screening in this selection`}
                onClick={() => setGrain(g.key)}
              >
                {g.label}
                {count !== undefined && (
                  <span className="seg-btn-count">{count === 1 ? '1 period' : `${count} periods`}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && data === null && <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>Loading…</p>}

      {!error && data !== null && periods.length === 0 && (
        <div className="empty-state" style={{ padding: 18 }}>
          No screenings in this selection yet.
        </div>
      )}

      {periods.length > 0 && (
        <>
          {/* Columns FLEX to fill the card (capped, so two periods are two
              columns in a full-width chart, not two 62px stubs marooned in
              1500px — which is exactly how this read before). The score line
              over them is what makes it a direction rather than a snapshot. */}
          <div style={{ marginTop: 22 }}>
            <PeriodChart
              points={periods.map((p) => ({
                key: p.key,
                label: p.label,
                value: p.athletes,
                segments: BAND_TOKENS.map((b) => ({ label: b.label, value: p.bands[b.key], color: b.color })),
                line: typeof p.averages?.totalScore === 'number' ? p.averages.totalScore : null,
              }))}
              valueLabel="Athletes tested"
              lineLabel="Average Total Score"
              height={158}
              // A single period gets the finer buckets it is made of; two periods
              // get metric slopes, because with two the comparison IS the content
              // and a pair of columns leaves the reader to do the subtraction.
              composition={data?.composition?.periods.map((p) => ({
                key: p.key,
                label: p.label,
                value: p.athletes,
                segments: BAND_TOKENS.map((b) => ({ label: b.label, value: p.bands[b.key], color: b.color })),
                line: typeof p.averages?.totalScore === 'number' ? p.averages.totalScore : null,
              }))}
              compositionGrain={data?.composition?.grain}
              slope={periods.length === 2 ? COMPARED_METRICS.map(([key, label, higherBetter]) => ({
                key,
                label,
                from: typeof periods[0].averages?.[key] === 'number' ? (periods[0].averages[key] as number) : null,
                to: typeof periods[1].averages?.[key] === 'number' ? (periods[1].averages[key] as number) : null,
                higherBetter,
                // The API's own verdict — it already knows exercise risks improve
                // downwards and that a small move is noise.
                direction: periods[1].deltas?.[key]?.direction ?? null,
              })) : undefined}
            />
          </div>

          {/* Counts, not just colour: the stack shows proportion, these say how
              many — and they keep the panel readable without relying on hue. */}
          {latest && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 'var(--fs-sm)', marginTop: 10 }}>
              <span className="text-muted">{latest.label}:</span>
              {BAND_TOKENS.map((t) => (
                <span key={t.key}>
                  <i style={{
                    display: 'inline-block', width: 9, height: 9, borderRadius: 2,
                    background: t.color, marginRight: 5,
                  }} />
                  {t.label} <strong>{latest.bands[t.key]}</strong>
                </span>
              ))}
              <Link href="/admin/activity" style={{ marginLeft: 'auto' }}>
                Full programme activity →
              </Link>
            </div>
          )}

          <div style={{ fontSize: 'var(--fs-sm)', marginTop: 10 }}>
            {delta !== null && prev ? (
              <>
                Average Total Score{' '}
                <strong>{typeof avgTotal === 'number' ? avgTotal : '—'}</strong>{' '}
                <strong style={{ color: tone }}>
                  ({delta > 0 ? '+' : ''}{delta})
                </strong>{' '}
                <span className="text-muted">
                  vs {prev.label}{d?.direction ? ` · ${d.direction}` : ''}
                </span>
              </>
            ) : (
              // A single period has no direction. Saying so is better than
              // showing a "trend" panel that is really just one bar.
              <span className="text-muted">
                Only one {grain === 'year' ? 'year' : grain === 'quarter' ? 'quarter' : 'month'} of
                screening falls in this selection, so there is no change to report yet —
                {grain === 'year' ? ' try Quarterly' : ' try Monthly'} for a finer breakdown.
              </span>
            )}
          </div>

          {/* Short, because the chart now labels itself: the columns carry
              proportion and say so by being equal, the headcount is printed
              above each, and the score strip states its own range. The note it
              replaced had to explain two encodings sharing one unlabelled
              plot. */}
          <p className="chart-note" style={{ marginBottom: 0 }}>
            Counted from screening history, so an athlete tested twice counts once per period
            they were tested in.
          </p>
        </>
      )}
    </div>
  );
}
