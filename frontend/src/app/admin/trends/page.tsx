'use client';

// Admin · Recovery & Trends. A read-only report over the injury table: how many
// athletes have recovered, who has recurring problems (2+ injuries in the same
// body part, plus recurrent-mechanism and chronic cases), and how injuries
// cluster within each sport. Backed by GET /api/injuries/analytics/trends.

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface Repeat { bodyPart: string; count: number }
interface RecurringAthlete { athleteId: string; name: string; sport: string; repeats: Repeat[]; totalCases: number }
interface SportRow { sport: string; injuries: number; athletes: number; active: number }
interface Trends {
  total: number;
  athletesAffected: number;
  statusCount: { Recovered: number; Recovering: number; Chronic: number };
  recoveryRate: number;
  fullyRecovered: number;
  stillAffected: number;
  chronicAthletes: number;
  recurrentInjuries: number;
  recurringAthletes: RecurringAthlete[];
  bySport: SportRow[];
}

const STATUS_META: Array<[keyof Trends['statusCount'], string]> = [
  ['Recovered', 'var(--risk-low)'],
  ['Recovering', 'var(--risk-mod)'],
  ['Chronic', 'var(--risk-high)'],
];

export default function AdminTrendsPage() {
  const [data, setData] = useState<Trends | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [sport, setSport] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<string[]>('/athletes/meta/sports').then(setSports).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = sport ? `?sport=${encodeURIComponent(sport)}` : '';
      setData(await api.get<Trends>(`/injuries/analytics/trends${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  }, [sport]);
  useEffect(() => { load(); }, [load]);

  const statusTotal = data ? data.statusCount.Recovered + data.statusCount.Recovering + data.statusCount.Chronic : 0;
  const pct = (n: number) => (statusTotal ? Math.round((n / statusTotal) * 100) : 0);

  return (
    <DashboardLayout allowedRoles={['admin']} title="Recovery & Trends">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Recovery &amp; Trends</h2>
            <span className="card-sub">Recovery status, recurring problems, and how injuries cluster by sport{sport ? ` · filtered to ${sport}` : ' · all sports'}.</span>
          </div>
          <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Filter by sport" style={{ flexShrink: 0 }}>
            <option value="">All sports</option>
            {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>

        {loading ? (
          <p className="text-muted">Loading trends…</p>
        ) : !data || data.total === 0 ? (
          <div className="empty-state">No injuries on record{sport ? ` for ${sport}` : ''}.</div>
        ) : (
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="stat-tile-label">Total injuries</div>
              <div className="stat-tile-value">{data.total}</div>
              <div className="stat-tile-delta">{data.athletesAffected} athlete{data.athletesAffected === 1 ? '' : 's'} affected</div>
            </div>
            <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-low)' }}>
              <div className="stat-tile-label">Recovery rate</div>
              <div className="stat-tile-value">{data.recoveryRate}%</div>
              <div className="stat-tile-delta">{data.statusCount.Recovered} of {data.total} cases recovered</div>
            </div>
            <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-low)' }}>
              <div className="stat-tile-label">Fully recovered</div>
              <div className="stat-tile-value">{data.fullyRecovered}</div>
              <div className="stat-tile-delta">athletes with no active injury</div>
            </div>
            <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-mod)' }}>
              <div className="stat-tile-label">Still affected</div>
              <div className="stat-tile-value">{data.stillAffected}</div>
              <div className="stat-tile-delta">athletes carrying ≥1 active injury</div>
            </div>
            <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-high)' }}>
              <div className="stat-tile-label">Recurring problems</div>
              <div className="stat-tile-value">{data.recurringAthletes.length}</div>
              <div className="stat-tile-delta">athletes with a repeated body part</div>
            </div>
            <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-high)' }}>
              <div className="stat-tile-label">Chronic cases</div>
              <div className="stat-tile-value">{data.chronicAthletes}</div>
              <div className="stat-tile-delta">{data.recurrentInjuries} recurrent-mechanism injur{data.recurrentInjuries === 1 ? 'y' : 'ies'}</div>
            </div>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <>
          {/* Recovery status breakdown */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Recovery status</h2>
              <span className="card-sub">Every injury on record, by current status.</span>
            </div></div>
            <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              {STATUS_META.map(([k, c]) => (
                data.statusCount[k] > 0 ? (
                  <div key={k} style={{ width: `${pct(data.statusCount[k])}%`, background: c }} title={`${k}: ${data.statusCount[k]}`} />
                ) : null
              ))}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {STATUS_META.map(([k, c]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                  <strong>{k}</strong> {data.statusCount[k]} ({pct(data.statusCount[k])}%)
                </span>
              ))}
            </div>
          </div>

          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Recurring problems */}
            <div className="card">
              <div className="card-header"><div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Recurring problems</h2>
                <span className="card-sub">Athletes with 2+ injuries in the same body part — repeat-injury risk.</span>
              </div></div>
              {data.recurringAthletes.length === 0 ? (
                <div className="empty-state">No athlete has a repeated body-part injury{sport ? ` in ${sport}` : ''}.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Athlete</th><th>Sport</th><th>Repeated body parts</th><th style={{ textAlign: 'center' }}>Total</th></tr></thead>
                    <tbody>
                      {data.recurringAthletes.map((a) => (
                        <tr key={a.athleteId}>
                          <td><strong>{a.name}</strong><div className="text-muted" style={{ fontSize: '0.76rem' }}>{a.athleteId}</div></td>
                          <td>{a.sport}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {a.repeats.map((r) => (<span key={r.bodyPart} className="badge-high">{r.bodyPart} ×{r.count}</span>))}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{a.totalCases}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Same-sport clustering */}
            <div className="card">
              <div className="card-header"><div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by sport</h2>
                <span className="card-sub">How many athletes fell injured within each sport, and how many are still active.</span>
              </div></div>
              {data.bySport.length === 0 ? (
                <div className="empty-state">No data.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Sport</th><th style={{ textAlign: 'center' }}>Injuries</th><th style={{ textAlign: 'center' }}>Athletes</th><th style={{ textAlign: 'center' }}>Active</th></tr></thead>
                    <tbody>
                      {data.bySport.map((s) => (
                        <tr key={s.sport}>
                          <td><strong>{s.sport}</strong></td>
                          <td style={{ textAlign: 'center' }}>{s.injuries}</td>
                          <td style={{ textAlign: 'center' }}>{s.athletes}</td>
                          <td style={{ textAlign: 'center', color: s.active > 0 ? 'var(--risk-high)' : 'inherit' }}>{s.active || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
