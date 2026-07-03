'use client';

// Coach · Squad Readiness (experimental 4th role). Read-only view of the
// athletes in the coach's assigned sport(s), bucketed into Full-Go /
// Observation / Restricted using the SAME graded composite-risk model the
// athlete and medical views use (lib/risk.ts) — no separate logic. The backend
// (routes/coach.js) supplies ACWR + profile + flags + active injuries; the
// classification happens here so risk.ts stays the single source of truth.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { classifyCompositeRisk, RiskCls, MuscleEntry } from '@/lib/risk';
import { computeBodyPartAlerts, AthleteRisks } from '@/lib/screeningAlerts';

interface ReadinessRow {
  athleteId: string;
  name: string;
  sport: string;
  acwr: number;
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  activeInjuries: Array<{ recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic' }>;
}

interface ReadinessResponse {
  sports: string[];
  athletes: ReadinessRow[];
}

type Band = 'full' | 'observation' | 'restricted';

const BAND_META: Record<Band, { label: string; badge: string; color: string }> = {
  full: { label: 'Full-Go', badge: 'badge-low', color: 'var(--risk-low, #2e9e5b)' },
  observation: { label: 'Observation', badge: 'badge-moderate', color: 'var(--risk-mod, #d99a16)' },
  restricted: { label: 'Restricted', badge: 'badge-high', color: 'var(--risk-high, #d14b4b)' },
};

// Map the graded composite-risk class onto a coaching readiness band.
// low → Full-Go · mod/under → Observation · high → Restricted.
function bandFor(cls: RiskCls): Band {
  if (cls === 'high') return 'restricted';
  if (cls === 'mod' || cls === 'under') return 'observation';
  return 'full';
}

export default function CoachDashboard() {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ReadinessResponse>('/coach/readiness');
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load squad readiness');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Classify every athlete once, then sort worst-first so the coach sees the
  // athletes needing attention at the top.
  const classified = useMemo(() => {
    if (!data) return [];
    const ORDER: Record<Band, number> = { restricted: 0, observation: 1, full: 2 };
    return data.athletes
      .map((a) => {
        const risk = classifyCompositeRisk(a.acwr, a, a.activeInjuries);
        const screening = computeBodyPartAlerts(a.risks, a.sport);
        return { row: a, risk, band: bandFor(risk.cls), screening };
      })
      .sort((x, y) => ORDER[x.band] - ORDER[y.band] || y.risk.vulnerability - x.risk.vulnerability);
  }, [data]);

  // Athletes whose sport-critical body region is out of screening range — the
  // headline injury alert for the squad.
  const screeningFlagged = useMemo(
    () => classified.filter((x) => x.screening.hasCriticalAlert),
    [classified],
  );

  const counts = useMemo(() => {
    const c = { full: 0, observation: 0, restricted: 0 };
    classified.forEach((x) => { c[x.band]++; });
    return c;
  }, [classified]);

  const total = classified.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <DashboardLayout allowedRoles={['coach']} title="Squad Readiness">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Squad Readiness Overview</h2>
            <span className="card-sub">
              {data?.sports.length ? `Assigned sports: ${data.sports.join(', ')}` : 'No sports assigned to your account yet'}
              {' · '}read-only · readiness derived from composite injury-risk model
            </span>
          </div>
        </div>

        {loading ? (
          <p className="text-muted">Loading squad…</p>
        ) : total === 0 ? (
          <div className="empty-state">
            No athletes found for your assigned sport(s). An administrator assigns sports to your account.
          </div>
        ) : (
          <>
            {/* Readiness split — coaching overview */}
            <div className="stat-grid" style={{ marginBottom: 8 }}>
              {(['full', 'observation', 'restricted'] as Band[]).map((b) => (
                <div className="stat-tile" key={b} style={{ borderTop: `3px solid ${BAND_META[b].color}` }}>
                  <div className="stat-tile-label">{BAND_META[b].label}</div>
                  <div className="stat-tile-value">{pct(counts[b])}%</div>
                  <div className="stat-tile-delta">
                    {counts[b]} athlete{counts[b] === 1 ? '' : 's'}
                    {b === 'full' ? ' · cleared' : b === 'observation' ? ' · modified load' : ' · clinical priority'}
                  </div>
                </div>
              ))}
            </div>

            {/* Stacked readiness bar */}
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 6 }}>
              {(['full', 'observation', 'restricted'] as Band[]).map((b) =>
                counts[b] > 0 ? (
                  <div
                    key={b}
                    style={{ width: `${pct(counts[b])}%`, background: BAND_META[b].color }}
                    title={`${BAND_META[b].label}: ${counts[b]}`}
                  />
                ) : null,
              )}
            </div>
          </>
        )}
      </div>

      {/* Squad-level injury alert — athletes whose sport-critical body region
          is out of screening range. Surfaced before the readiness table. */}
      {screeningFlagged.length > 0 && (
        <div className="screening-alert screening-alert--high" role="alert" style={{ marginBottom: 20 }}>
          <div className="screening-alert-head">
            <span className="screening-alert-icon" aria-hidden>⚠</span>
            <div>
              <div className="screening-alert-title">
                {screeningFlagged.length} athlete{screeningFlagged.length === 1 ? '' : 's'} with sport-critical screening alerts
              </div>
              <div className="screening-alert-sub">
                A body region important for their sport is not within a healthy screening range.
              </div>
            </div>
          </div>
          <ul className="screening-alert-list">
            {screeningFlagged.map(({ row, screening }) => (
              <li key={row.athleteId} className="screening-alert-item is-critical">
                <span className="screening-alert-label">{row.name}</span>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  {screening.criticalAlerts.map((a) => a.label).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Athletes</h2>
              <span className="card-sub">Sorted by priority · highest concern first</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Sport</th>
                  <th style={{ textAlign: 'center' }}>Readiness</th>
                  <th style={{ textAlign: 'center' }}>ACWR</th>
                  <th>Risk level</th>
                  <th style={{ textAlign: 'center' }}>Screening</th>
                  <th style={{ textAlign: 'center' }}>Active injuries</th>
                </tr>
              </thead>
              <tbody>
                {classified.map(({ row, risk, band, screening }) => (
                  <tr key={row.athleteId}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.78rem' }}>{row.athleteId}</div>
                    </td>
                    <td>{row.sport}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={BAND_META[band].badge}>{BAND_META[band].label}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {row.acwr > 0 ? row.acwr.toFixed(2) : '—'}
                    </td>
                    <td>
                      {risk.level}
                      {risk.escalated && (
                        <span className="text-muted" style={{ fontSize: '0.72rem', display: 'block' }}>
                          escalated
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {screening.hasCriticalAlert ? (
                        <span className="badge-high" title={screening.criticalAlerts.map((a) => `${a.label} ${a.value.toFixed(0)}`).join(', ')}>
                          ⚠ critical
                        </span>
                      ) : screening.topBand === 'high' ? (
                        <span className="badge-moderate" title={screening.alerts.map((a) => `${a.label} ${a.value.toFixed(0)}`).join(', ')}>
                          elevated
                        </span>
                      ) : !screening.hasData ? (
                        <span className="text-muted" title="No HoloMotion screening ingested for this athlete yet">no data</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.activeInjuries.length || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 12, marginBottom: 0 }}>
            Readiness is informational. Clinical decisions and overrides remain with medical staff.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
