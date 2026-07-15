'use client';

// Coach · Squad Readiness (experimental 4th role). Read-only view of the
// athletes in the coach's assigned sport(s), bucketed into Full-Go /
// Observation / Restricted straight from each athlete's cohort-normed
// HoloMotion band — the same indicator the athlete and medical views report, so
// all three roles quote one number. Readiness was previously derived from the
// composite training-load model (lib/risk.ts); that was removed from the
// dashboards on 2026-07-16 (see docs/fyp/ACWR_REBUILD.md). The backend
// (routes/coach.js) supplies the profile + flags + active injuries + indicator.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { MuscleEntry } from '@/lib/risk';
import { computeBodyPartAlerts, AthleteRisks } from '@/lib/screeningAlerts';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';

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
  screening?: ScreeningIndicator | null;
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

// Map the cohort-normed HoloMotion band onto a coaching readiness band.
// green → Full-Go · amber → Observation · red → Restricted.
//
// This was previously derived from the composite training-load class
// (classifyCompositeRisk). That was removed from the dashboards on 2026-07-16:
// it meant readiness was really an ACWR verdict, and because most athletes have
// no logged sessions their acwr was 0 → "Detraining Risk" → Observation, which
// put 96% of the squad in Observation and made the board useless. Readiness now
// follows the same screening indicator every other surface reports, so the
// coach and the medical team are looking at the same number.
function bandFor(effectiveBand?: 'green' | 'amber' | 'red' | null): Band | null {
  if (effectiveBand === 'red') return 'restricted';
  if (effectiveBand === 'amber') return 'observation';
  if (effectiveBand === 'green') return 'full';
  return null; // no screening / cohort too small to score
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
  // athletes needing attention at the top. Unscored athletes sort last.
  const classified = useMemo(() => {
    if (!data) return [];
    const ORDER: Record<Band, number> = { restricted: 0, observation: 1, full: 2 };
    return data.athletes
      .map((a) => {
        const screening = computeBodyPartAlerts(a.risks, a.sport);
        // Worst sport-critical region (alerts are already sorted worst-first),
        // falling back to the worst region of any kind — what the table names.
        const worst = screening.criticalAlerts[0] ?? screening.alerts[0] ?? null;
        return { row: a, band: bandFor(a.screening?.effectiveBand), screening, worst };
      })
      .sort((x, y) => {
        const ox = x.band ? ORDER[x.band] : 3;
        const oy = y.band ? ORDER[y.band] : 3;
        // Within a band, lower indicator = more concerning = higher up.
        return ox - oy || (x.row.screening?.overallIndicator ?? 101) - (y.row.screening?.overallIndicator ?? 101);
      });
  }, [data]);

  const counts = useMemo(() => {
    const c = { full: 0, observation: 0, restricted: 0, unscored: 0 };
    classified.forEach((x) => { if (x.band) c[x.band]++; else c.unscored++; });
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
              {' · '}read-only · readiness from each athlete&apos;s cohort-normed HoloMotion indicator — the same band the medical team sees
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

      {/* NOTE: a squad-level "N athletes with sport-critical screening alerts"
          banner used to sit here. It was removed on 2026-07-16: it fired on any
          sport-critical region at Watch or worse, so it listed 27 of 28 athletes
          — a red block naming nearly the whole squad tells a coach nothing. It
          also duplicated the table below, which is already sorted worst-first
          and now names each athlete's worst region. Restricted athletes are the
          top rows; that IS the alert. */}

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
                  <th style={{ textAlign: 'center' }}>HoloMotion Risk</th>
                  <th style={{ textAlign: 'center' }}>Readiness</th>
                  <th style={{ textAlign: 'center' }}>Screening</th>
                  <th style={{ textAlign: 'center' }}>Active injuries</th>
                </tr>
              </thead>
              <tbody>
                {classified.map(({ row, band, screening, worst }) => (
                  <tr key={row.athleteId}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.78rem' }}>{row.athleteId}</div>
                    </td>
                    <td>{row.sport}</td>
                    <td style={{ textAlign: 'center' }}>
                      <OverallRiskBadge screening={row.screening} compact />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {band
                        ? <span className={BAND_META[band].badge}>{BAND_META[band].label}</span>
                        : <span className="text-muted" style={{ fontSize: '0.78rem' }}>Not scored</span>}
                    </td>
                    {/* The worst sport-critical region, named. This column used
                        to read "⚠ critical" for literally every athlete (59/59
                        measured), because it fired on any sport-critical region
                        at Watch or worse — useless as a scan target. Naming the
                        region and its band gives the coach something that
                        actually varies and that they can act on. */}
                    <td style={{ textAlign: 'center' }}>
                      {!screening.hasData ? (
                        <span className="text-muted" title="No HoloMotion screening ingested for this athlete yet">no data</span>
                      ) : worst ? (
                        <span
                          className={worst.band === 'high' ? 'badge-high' : 'badge-moderate'}
                          title={screening.alerts.map((a) => `${a.label} ${a.value.toFixed(0)}`).join(' · ')}
                        >
                          {worst.label} {worst.value.toFixed(0)}
                        </span>
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
