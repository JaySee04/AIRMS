'use client';

// Athlete · My Squad (C3). A read-only, summary view of the athlete's own squad
// (same sport): each teammate's overall risk band + cohort-normed indicator.
// Deliberately NO peer clinical/screening detail — athletes see squad readiness,
// not each other's reports (privacy). Backed by GET /api/athletes/teammates.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface Teammate {
  athleteId: string; name: string; program: string | null; gender: string | null;
  isSelf: boolean; overallIndicator: number | null; effectiveBand: 'green' | 'amber' | 'red' | null;
}
interface Resp { sport: string; teammates: Teammate[]; }

const BAND: Record<'green' | 'amber' | 'red', { label: string; color: string }> = {
  green: { label: 'Safe', color: 'var(--risk-low)' },
  amber: { label: 'Needs attention', color: 'var(--risk-moderate)' },
  red: { label: 'Immediate assessment', color: 'var(--risk-high)' },
};

export default function AthleteSquadPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { setLoading(true); const r = await api.get<Resp>('/athletes/teammates'); if (!cancelled) setData(r); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load squad'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const m = { green: 0, amber: 0, red: 0, none: 0 };
    (data?.teammates ?? []).forEach((t) => { if (t.effectiveBand) m[t.effectiveBand] += 1; else m.none += 1; });
    return m;
  }, [data]);

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Squad">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>{data?.sport ?? 'My'} Squad</h2>
          <span className="card-sub">Your squad&apos;s readiness at a glance — read-only. Detailed reports stay private to each athlete and the medical team.</span>
        </div></div>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : !data || data.teammates.length === 0 ? (
          <div className="empty-state">No squad on record.</div>
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              {(['green', 'amber', 'red'] as const).map((b) => (
                <div className="stat-tile" key={b} style={{ borderTop: `3px solid ${BAND[b].color}` }}>
                  <div className="stat-tile-label">{BAND[b].label}</div>
                  <div className="stat-tile-value">{counts[b]}</div>
                  <div className="stat-tile-delta">athlete{counts[b] === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Athlete</th><th>Programme</th><th style={{ textAlign: 'center' }}>Readiness</th><th style={{ textAlign: 'center' }}>Indicator</th></tr></thead>
                <tbody>
                  {data.teammates.map((t) => (
                    <tr key={t.athleteId} style={t.isSelf ? { background: 'var(--bg)' } : undefined}>
                      <td><strong>{t.name}</strong>{t.isSelf && <span className="badge-low" style={{ marginLeft: 8 }}>You</span>}</td>
                      <td className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>{t.program ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {t.effectiveBand ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BAND[t.effectiveBand].color }} />
                            {BAND[t.effectiveBand].label}
                          </span>
                        ) : <span className="text-muted">Not scored</span>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{t.overallIndicator ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 10, marginBottom: 0 }}>
              Indicator is the cohort-normed score (0–100, 50 = group average). Only squad readiness is shared here — detailed screening reports aren&apos;t visible between athletes.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
