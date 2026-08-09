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

interface Period {
  key: string;
  label: string;
  tests: number;
  athletes: number;
  bands: { green: number; amber: number; red: number; none: number };
  avg: Record<string, number | null>;
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

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

// Band mix as one stacked bar. Height carries how many athletes were tested, so
// a thin bar reads as "few tests" rather than silently weighting equally with a
// period that tested the whole squad.
function PeriodBar({ p, max }: { p: Period; max: number }) {
  const total = p.bands.green + p.bands.amber + p.bands.red;
  const height = max > 0 ? Math.max(14, (p.athletes / max) * 74) : 14;
  const title = `${p.label} — ${p.athletes} athlete${p.athletes === 1 ? '' : 's'} tested`
    + ` · ${p.bands.green} green, ${p.bands.amber} amber, ${p.bands.red} red`;
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div
        title={title}
        style={{
          height, display: 'flex', flexDirection: 'column-reverse',
          borderRadius: 3, overflow: 'hidden', marginBottom: 6,
          background: 'var(--border)',
        }}
      >
        {total > 0 ? (
          <>
            <div style={{ height: `${pct(p.bands.green, total)}%`, background: 'var(--risk-low)' }} />
            <div style={{ height: `${pct(p.bands.amber, total)}%`, background: 'var(--risk-moderate)' }} />
            <div style={{ height: `${pct(p.bands.red, total)}%`, background: 'var(--risk-high)' }} />
          </>
        ) : null}
      </div>
      <div style={{ fontSize: '0.68rem', fontWeight: 600 }}>{p.athletes}</div>
      <div className="text-muted" style={{ fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

  // Direction on the headline score, latest period against the one before it.
  const a = periods.length >= 2 ? periods[periods.length - 2].avg : null;
  const b = periods.length >= 2 ? periods[periods.length - 1].avg : null;
  const key = 'totalScore';
  const delta = a && b && typeof a[key] === 'number' && typeof b[key] === 'number'
    ? Math.round(((b[key] as number) - (a[key] as number)) * 10) / 10
    : null;

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
            {periods.map((p) => (<PeriodBar key={p.key} p={p} max={max} />))}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem' }}>
            {delta !== null && (
              <span>
                Average Total Score{' '}
                <strong style={{ color: delta >= 0 ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                  {delta > 0 ? '+' : ''}{delta}
                </strong>{' '}
                <span className="text-muted">vs the previous period</span>
              </span>
            )}
            <span className="text-muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--risk-low)', marginRight: 4 }} />Green</span>
              <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--risk-moderate)', marginRight: 4 }} />Amber</span>
              <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--risk-high)', marginRight: 4 }} />Red</span>
            </span>
            <Link href="/admin/activity" style={{ marginLeft: 'auto', fontSize: '0.78rem' }}>
              Full programme activity →
            </Link>
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
