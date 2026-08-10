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

type Grain = 'month' | 'quarter' | 'year';

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
interface PeriodsResponse { grain: Grain; periods: Period[] }

const GRAINS: Array<{ key: Grain; label: string }> = [
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

// How many periods fit before this stops being a summary and starts being the
// Programme Activity page.
const SHOWN = 6;

// Columns are a FIXED width rather than flexing to fill the row. A yearly view
// of a young dataset is one period, and a single flexing bar stretched the whole
// card into a tricolour banner that looked like a status flag rather than a
// chart. One period should look like one column.
const COL_W = 62;
const PLOT_H = 78;

const BAND_TOKENS = [
  { key: 'green' as const, label: 'Green', color: 'var(--risk-low)' },
  { key: 'amber' as const, label: 'Amber', color: 'var(--risk-moderate)' },
  { key: 'red' as const, label: 'Red', color: 'var(--risk-high)' },
];

function PeriodColumn({ p, max }: { p: Period; max: number }) {
  const banded = p.bands.green + p.bands.amber + p.bands.red;
  const h = max > 0 ? Math.max(10, Math.round((p.athletes / max) * PLOT_H)) : 10;
  const parts = BAND_TOKENS
    .map((b) => ({ ...b, n: p.bands[b.key] }))
    .filter((b) => b.n > 0);

  return (
    <div style={{ width: COL_W, flex: `0 0 ${COL_W}px`, textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 3 }}>{p.athletes}</div>
      {/* Fixed-height plot area so every column's bar grows from the same
          baseline — otherwise short bars float and the row reads as noise. */}
      <div style={{ height: PLOT_H, display: 'flex', alignItems: 'flex-end' }}>
        <div
          style={{
            width: '100%', height: h, display: 'flex', flexDirection: 'column-reverse',
            borderRadius: 3, overflow: 'hidden',
            background: banded > 0 ? 'transparent' : 'var(--border)',
          }}
        >
          {parts.map((b) => (
            <div
              key={b.key}
              title={`${p.label} — ${b.label}: ${b.n} of ${banded}`}
              style={{ height: `${(b.n / banded) * 100}%`, background: b.color }}
            />
          ))}
        </div>
      </div>
      <div className="text-muted" style={{ fontSize: '0.64rem', marginTop: 5, whiteSpace: 'nowrap' }}>
        {p.label}
      </div>
    </div>
  );
}

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
  const max = Math.max(1, ...periods.map((p) => p.athletes));
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
            Athletes tested and their band mix over recent periods, for the current filters.
          </span>
        </div>
        <div className="seg-group" role="tablist" aria-label="Trend period">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`seg-btn${grain === g.key ? ' active' : ''}`}
              aria-pressed={grain === g.key}
              onClick={() => setGrain(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && data === null && <p className="text-muted" style={{ fontSize: '0.85rem' }}>Loading…</p>}

      {!error && data !== null && periods.length === 0 && (
        <div className="empty-state" style={{ padding: 18 }}>
          No screenings in this selection yet.
        </div>
      )}

      {periods.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 6 }}>
            {periods.map((p) => (<PeriodColumn key={p.key} p={p} max={max} />))}
          </div>

          {/* Counts, not just colour: the stack shows proportion, these say how
              many — and they keep the panel readable without relying on hue. */}
          {latest && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline', fontSize: '0.78rem', marginTop: 10 }}>
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

          <div style={{ fontSize: '0.78rem', marginTop: 10 }}>
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

          <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: 8, marginBottom: 0 }}>
            Bar height = athletes tested that period. Counted from screening history,
            so an athlete tested twice counts once per period they were tested in.
          </p>
        </>
      )}
    </div>
  );
}
