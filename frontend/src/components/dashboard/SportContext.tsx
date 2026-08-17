'use client';

// The athlete read against their OWN sport, for the clinician looking at them.
//
// Dr Thung, 2026-04-24 (13:00): "the doctor in the room can also see, okay, this
// spot, what are the prominent kind of injury and when going to happen? So you
// can also give them a good advice."
//
// The medical view used to answer that from the injury log. That went with the
// HoloMotion-only cut, so it is answered from screening instead: which region
// the sport carries, and whether THIS athlete is worse or better than their
// squad on it. Ordered by what is prominent in the SPORT, not by this athlete's
// worst reading — the question is "what does this squad tend to have", and the
// athlete's standing is read against that.

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Row {
  key: string; label: string;
  squadAvg: number | null; squadN: number;
  elevated: number; watch: number; elevatedShare: number | null;
  value: number | null; band: 'ok' | 'watch' | 'high' | null;
  vsSquad: number | null;
}
interface Payload { sport: string | null; n: number; indicators: Row[] }

const BAND_CLASS: Record<string, string> = { ok: 'badge-low', watch: 'badge-moderate', high: 'badge-high' };
const BAND_WORD: Record<string, string> = { ok: 'Low', watch: 'Watch', high: 'Elevated' };

export default function SportContext({ athleteId }: { athleteId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    (async () => {
      try {
        const d = await api.get<Payload>(`/athletes/${athleteId}/sport-context`);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load sport context');
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="card"><p className="text-muted">Loading sport context…</p></div>;
  if (!data.sport || data.n === 0) {
    return (
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Sport context</h2>
        </div></div>
        <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
          {data.sport
            ? `No other screened athlete in ${data.sport} yet, so there is nothing to compare against.`
            : 'This athlete has no sport recorded, so there is no squad to compare against.'}
        </div>
      </div>
    );
  }

  // The squad's characteristic problem, and where this athlete sits worst
  // relative to it — the two sentences a clinician would say out loud.
  const prominent = data.indicators.find((r) => (r.elevatedShare ?? 0) > 0) ?? null;
  const worstVs = [...data.indicators]
    .filter((r) => r.vsSquad !== null)
    .sort((a, b) => (b.vsSquad as number) - (a.vsSquad as number))[0] ?? null;

  return (
    <div className="card">
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Sport context · {data.sport}</h2>
        <span className="card-sub">
          This athlete against the {data.n} screened {data.sport} athlete{data.n === 1 ? '' : 's'}, ordered by
          what the squad carries most — not by this athlete&rsquo;s worst reading.
        </span>
      </div></div>

      {(prominent || worstVs) && (
        <div style={{ fontSize: 'var(--fs-md)', marginBottom: 14, lineHeight: 1.6 }}>
          {prominent && (
            <>
              <strong>{data.sport}</strong> carries <strong>{prominent.label}</strong> most:{' '}
              {prominent.elevated} of {prominent.squadN} elevated ({Math.round((prominent.elevatedShare as number) * 100)}%).{' '}
            </>
          )}
          {worstVs && worstVs.vsSquad !== null && worstVs.vsSquad > 0 && (
            <>
              This athlete is furthest above their squad on <strong>{worstVs.label}</strong>{' '}
              (<span style={{ color: 'var(--risk-high)', fontWeight: 700 }}>+{worstVs.vsSquad}</span> vs the squad average).
            </>
          )}
          {worstVs && worstVs.vsSquad !== null && worstVs.vsSquad <= 0 && (
            <>This athlete is at or below their squad average on every indicator.</>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>Indicator</th>
              <th style={{ textAlign: 'right' }}>Squad avg</th>
              <th style={{ textAlign: 'right' }}>Elevated in squad</th>
              <th style={{ textAlign: 'right' }}>This athlete</th>
              <th style={{ textAlign: 'right' }}>vs squad</th>
            </tr>
          </thead>
          <tbody>
            {data.indicators.map((r) => (
              <tr key={r.key}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td style={{ textAlign: 'right' }}>{r.squadAvg ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {r.elevated > 0
                    ? <span style={{ color: 'var(--risk-high)', fontWeight: 700 }}>
                        {r.elevated} <span style={{ fontWeight: 400 }}>({Math.round((r.elevatedShare ?? 0) * 100)}%)</span>
                      </span>
                    : <span className="text-muted">0</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.value === null ? <span className="text-muted">—</span> : (
                    <>
                      <strong>{r.value}</strong>{' '}
                      {r.band && <span className={BAND_CLASS[r.band]}>{BAND_WORD[r.band]}</span>}
                    </>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.vsSquad === null ? <span className="text-muted">—</span> : (
                    // Risk is lower-better, so ABOVE the squad average is worse.
                    <span
                      title={`${r.vsSquad > 0 ? 'above' : r.vsSquad < 0 ? 'below' : 'at'} the squad average — ${r.vsSquad > 0 ? 'worse' : r.vsSquad < 0 ? 'better' : 'the same'}`}
                      style={{ fontWeight: 700, color: r.vsSquad > 0 ? 'var(--risk-high)' : r.vsSquad < 0 ? 'var(--risk-low)' : 'var(--text-muted)' }}
                    >
                      {r.vsSquad > 0 ? '+' : ''}{r.vsSquad}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 10 }}>
        Readings are lower-is-better, so a positive &ldquo;vs squad&rdquo; is worse than the squad average.
        Elevated is &gt;25 on the standard bands.
      </div>
    </div>
  );
}
