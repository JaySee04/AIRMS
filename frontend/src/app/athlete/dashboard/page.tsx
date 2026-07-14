'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Fragment, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import AcwrGauge from '@/components/dashboard/AcwrGauge';

// Chart.js and the body-map path data are the heaviest client code on this
// page and render nothing on the server anyway — split them out so the
// dashboard shell paints without them.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const WorkloadChart = dynamic(() => import('@/components/dashboard/WorkloadChart'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { classifyCompositeRisk } from '@/lib/risk';

interface Activity {
  _id: string;
  date: string;
  type: string;
  duration: number;
  intensity: number;
  load: number;
  notes?: string;
}

interface AthleteRisks {
  neckInjuryRisk: number;
  shoulderInjuryRisk: number;
  scoliosis: number;
  spinalDiscHerniation: number;
  lumbarPelvisInjury: number;
  jointPain: number;
  kneeInjuryRisk: number;
  ankleInjuryRisk: number;
}

interface Athlete {
  athleteId: string;
  name: string;
  sport: string;
  age?: number;
  gender?: string;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  screening?: ScreeningIndicator | null;
}

interface Injury {
  _id: string;
  bodyPart: string;
  side: string;
  injuryType: string;
  severity: string;
  mechanism?: string;
  date: string;
  recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic';
  notes?: string;
}

const RISK_LABEL: Record<keyof AthleteRisks, string> = {
  neckInjuryRisk: 'Neck',
  shoulderInjuryRisk: 'Shoulder',
  scoliosis: 'Scoliosis',
  spinalDiscHerniation: 'Spinal Disc',
  lumbarPelvisInjury: 'Lumbar/Pelvis',
  jointPain: 'Joint Pain',
  kneeInjuryRisk: 'Knee',
  ankleInjuryRisk: 'Ankle',
};

function badgeClassFor(status: Injury['recoveryStatus']): string {
  if (status === 'Recovered') return 'badge-low';
  if (status === 'Recovering') return 'badge-moderate';
  return 'badge-high';
}

export default function AthleteDashboard() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [injuryTab, setInjuryTab] = useState<'active' | 'all'>('active');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleNote(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const session = getSession();
    if (!session?.user.athleteId) {
      setError('No athlete profile linked to this account.');
      setLoading(false);
      return;
    }
    setAthleteId(session.user.athleteId);
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [a, acts, injs] = await Promise.all([
          api.get<Athlete>(`/athletes/${athleteId}`),
          api.get<Activity[]>(`/activities/athlete/${athleteId}`),
          api.get<Injury[]>(`/injuries/athlete/${athleteId}`),
        ]);
        if (!cancelled) {
          setAthlete(a);
          setActivities(acts);
          setInjuries(injs);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Compute rolling-7-day load buckets for the last 8 weeks (today inclusive).
  // We use day-offset windows instead of ISO week keys so year boundaries
  // (Dec/Jan) don't silently drop activities into mismatched week slots.
  const computed = useMemo(() => {
    const today = new Date();
    const DAY = 86400000;
    // Window i: [today - (7-i)*7 .. today - (7-i)*7 + 7) days, last bucket is "this week".
    const weekLoads: number[] = Array(8).fill(0);
    const weekLabels: string[] = [];
    for (let i = 0; i < 8; i++) {
      const windowEnd = new Date(today);
      windowEnd.setDate(today.getDate() - (7 - i) * 7);
      const label = `W${String(8 - i).padStart(2, '0')}`; // W08 = oldest, W01 = current
      weekLabels.push(8 - i === 1 ? 'This wk' : `${8 - i} wk ago`);
    }
    activities.forEach((a) => {
      const aDate = new Date(a.date);
      const daysAgo = Math.floor((today.getTime() - aDate.getTime()) / DAY);
      if (daysAgo < 0 || daysAgo >= 56) return; // outside the 8-week window
      const bucketFromEnd = Math.floor(daysAgo / 7); // 0 = this week, 7 = oldest
      const index = 7 - bucketFromEnd;
      if (index >= 0 && index < 8) {
        weekLoads[index] += a.load ?? 0;
      }
    });
    const acuteLoad = weekLoads[7] ?? 0;
    const last4 = weekLoads.slice(-4);
    const chronicLoad = last4.reduce((s, v) => s + v, 0) / 4;
    const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
    const prev = weekLoads[6] ?? 0;
    const acuteDelta = prev > 0 ? ((acuteLoad - prev) / prev) * 100 : 0;
    const sessionsThisWeek = activities.filter((a) => {
      const d = new Date(a.date);
      return (today.getTime() - d.getTime()) / DAY <= 7;
    }).length;
    const cumACWR = weekLoads.map((_, i) => {
      const acuteW = weekLoads[i];
      const slice = weekLoads.slice(Math.max(0, i - 3), i + 1);
      const chronicW = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
      return chronicW > 0 ? +(acuteW / chronicW).toFixed(2) : 0;
    });
    const sharpDip = (prev > 0 && acuteLoad < 0.6 * prev) || (chronicLoad > 0 && acwr < 0.7);
    return {
      weekLabels,
      weekLoads,
      acuteLoad,
      chronicLoad,
      acwr,
      acuteDelta,
      sessionsThisWeek,
      cumACWR,
      sharpDip,
    };
  }, [activities]);

  const allInjuries = useMemo(
    () => [...injuries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    [injuries],
  );
  const activeInjuries = useMemo(
    () => allInjuries.filter((i) => i.recoveryStatus !== 'Recovered'),
    [allInjuries],
  );

  const risk = useMemo(
    () => classifyCompositeRisk(computed.acwr, athlete ?? {}, activeInjuries),
    [computed.acwr, athlete, activeInjuries],
  );

  // Fire-and-forget baseline trigger. POST is idempotent against an open
  // baseline (server returns the existing row), so this is safe to call
  // unconditionally on every dashboard load when risk is non-Low. The
  // PATCH-resolve fires when the athlete has returned to Low — the
  // resolve endpoint is a no-op when no baseline is active.
  useEffect(() => {
    if (!athlete) return;
    const nonLow = risk.cls === 'mod' || risk.cls === 'high';
    if (nonLow) {
      api.post('/recovery-baselines', {
        athleteId: athlete.athleteId,
        snapshotAcwr: +computed.acwr.toFixed(2),
        chronicLoad: +computed.chronicLoad.toFixed(0),
        targetLowMin: risk.personalisedRange.lowMin,
        targetLowMax: risk.personalisedRange.lowMax,
        triggerCls: risk.cls,
        triggerLevel: risk.level,
        factors: risk.factors,
      }).catch(() => null);
    } else {
      api.patch(`/recovery-baselines/athlete/${athlete.athleteId}/resolve`, {}).catch(() => null);
    }
  }, [athlete, risk, computed.acwr, computed.chronicLoad]);
  const shownInjuries = injuryTab === 'active' ? activeInjuries : allInjuries;

  const recentActivities = useMemo(
    () => [...activities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6),
    [activities],
  );

  if (loading) {
    return (
      <DashboardLayout allowedRoles={['athlete']} title="My Dashboard">
        <p className="text-muted">Loading dashboard…</p>
      </DashboardLayout>
    );
  }

  if (error || !athlete) {
    return (
      <DashboardLayout allowedRoles={['athlete']} title="My Dashboard">
        <div className="alert alert-error">{error ?? 'Athlete profile not found.'}</div>
      </DashboardLayout>
    );
  }

  const labels = computed.weekLabels;
  // Fixed canonical ordering (don't trust Object.keys iteration order).
  // Values are clamped to the radar's display max so an out-of-range
  // backend value can't silently clip outside the chart.
  const RISK_KEYS: Array<keyof AthleteRisks> = [
    'neckInjuryRisk',
    'shoulderInjuryRisk',
    'scoliosis',
    'spinalDiscHerniation',
    'lumbarPelvisInjury',
    'jointPain',
    'kneeInjuryRisk',
    'ankleInjuryRisk',
  ];
  const riskLabels = RISK_KEYS.map((k) => RISK_LABEL[k]);
  const riskValues = RISK_KEYS.map((k) => Math.min(30, Math.max(0, athlete.risks[k] ?? 0)));

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Dashboard">
      {/* Sport-aware screening alert — fires before the workload signal when a
          body region important for the athlete's sport is out of range */}
      <ScreeningAlertBanner risks={athlete.risks} sport={athlete.sport} audience="self" />

      {/* Overall HoloMotion risk indicator — cohort-normed traffic-light */}
      {athlete.screening && (
        <div style={{ marginBottom: 20 }}>
          <OverallRiskBadge screening={athlete.screening} />
        </div>
      )}

      {/* Risk hero */}
      <div className={`risk-hero risk-hero--${risk.cls}`}>
        <div style={{ flex: 1 }}>
          <div className="risk-hero-label">Current Status</div>
          <div className="risk-hero-level">
            {risk.level}
            {risk.escalated && (
              <span className="risk-escalation-badge">
                escalated from {risk.baseCls === 'low' ? 'Low Risk' : 'Moderate Risk'}
              </span>
            )}
          </div>
          <div className="risk-hero-msg">{risk.msg}</div>
          {risk.factors.length > 0 && (
            <div className="risk-factors">
              <span className="risk-factors-label">Risk modifiers:</span>
              {risk.factors.map((f) => (
                <span key={f} className="risk-factor-chip">{f}</span>
              ))}
            </div>
          )}
          <AcwrGauge
            acwr={computed.acwr}
            lowMin={risk.personalisedRange.lowMin}
            lowMax={risk.personalisedRange.lowMax}
            modMax={risk.personalisedRange.modMax}
            compositeCls={risk.cls}
            compositeLabel={risk.level}
          />
          {computed.sharpDip && (
            <div className="risk-hero-prompt">
              <span>
                <strong>Sharp drop in activity detected.</strong> Were you ill or injured this week?
                Adding context helps your medical staff interpret the trend.
              </span>
              <Link href="/athlete/injury-report" className="btn btn-outline btn-sm">
                Add Note
              </Link>
            </div>
          )}
        </div>
        <div className="risk-hero-acwr">
          <div className="risk-hero-acwr-val">{computed.acwr.toFixed(2)}</div>
          <div className="risk-hero-acwr-label">ACWR</div>
          <div className="risk-hero-acwr-thresholds">
            Personalised band:<br />
            <strong>{risk.personalisedRange.lowMin.toFixed(2)} – {risk.personalisedRange.lowMax.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">This Week&apos;s Load</div>
          <div className="stat-tile-value">{computed.acuteLoad.toLocaleString()}</div>
          <div
            className={
              'stat-tile-delta' +
              (computed.acuteDelta > 0
                ? ' stat-tile-delta--up'
                : computed.acuteDelta < 0
                ? ' stat-tile-delta--down'
                : '')
            }
          >
            {computed.acuteDelta > 0
              ? `▲ ${computed.acuteDelta.toFixed(0)}% vs last week`
              : computed.acuteDelta < 0
              ? `▼ ${Math.abs(computed.acuteDelta).toFixed(0)}% vs last week`
              : 'No change'}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">4-Week Average</div>
          <div className="stat-tile-value">{Math.round(computed.chronicLoad).toLocaleString()}</div>
          <div className="stat-tile-delta">Rolling baseline</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">ACWR</div>
          <div className="stat-tile-value">{computed.acwr.toFixed(2)}</div>
          <div className="stat-tile-delta">Acute ÷ Chronic</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Sessions Logged</div>
          <div className="stat-tile-value">{computed.sessionsThisWeek}</div>
          <div className="stat-tile-delta">Last 7 days</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2-1">
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Workload Trend (Last 8 Weeks)</h2>
              <span className="card-sub">Weekly load · ACWR overlay</span>
            </div>
          </div>
          <WorkloadChart
            labels={labels}
            weeklyLoads={computed.weekLoads}
            acwrSeries={computed.cumACWR}
          />
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
              <span className="card-sub">From last screening</span>
            </div>
          </div>
          <RiskRadar labels={riskLabels} values={riskValues} />
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* HoloMotion screening — gauges, indicator threshold strips, muscle
          flags. The full latest report, read against its thresholds, lives
          here on the dashboard rather than on a separate page. */}
      <ScreeningPanel athlete={athlete} />

      {/* Body map */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
            <span className="card-sub">Latest screening · L = left, R = right, B = both</span>
          </div>
        </div>
        <BodyMap myodynamia={athlete.myodynamia ?? []} tension={athlete.tension ?? []} />
      </div>

      {/* Recent activity + injuries */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Recent Activity</h2>
            <Link href="/athlete/activity" className="btn btn-outline btn-sm">View All</Link>
          </div>
          {recentActivities.length === 0 ? (
            <div className="empty-state">No activities logged yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Duration</th><th>Intensity</th><th>Load</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.map((a) => {
                    const isExpanded = expandedNotes.has(a._id);
                    return (
                      <Fragment key={a._id}>
                        <tr>
                          <td>
                            {a.notes && (
                              <button
                                type="button"
                                className="note-caret"
                                onClick={() => toggleNote(a._id)}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Hide note' : 'Show note'}
                                title={isExpanded ? 'Hide note' : 'Show note'}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            )}
                            {new Date(a.date).toISOString().slice(0, 10)}
                          </td>
                          <td>{a.type}</td>
                          <td>{a.duration} min</td>
                          <td>{a.intensity}/10</td>
                          <td><strong>{a.load}</strong></td>
                        </tr>
                        {isExpanded && a.notes && (
                          <tr className="activity-notes-row">
                            <td colSpan={5}>
                              <div className="activity-note">📝 {a.notes}</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Injury Records</h2>
            <Link href="/athlete/injury-report" className="btn btn-outline btn-sm">Report Injury</Link>
          </div>
          <div className="tabs">
            <button
              type="button"
              className={`tab${injuryTab === 'active' ? ' active' : ''}`}
              onClick={() => setInjuryTab('active')}
            >
              Active ({activeInjuries.length})
            </button>
            <button
              type="button"
              className={`tab${injuryTab === 'all' ? ' active' : ''}`}
              onClick={() => setInjuryTab('all')}
            >
              All History ({allInjuries.length})
            </button>
          </div>
          {shownInjuries.length === 0 ? (
            <div className="empty-state">
              {injuryTab === 'active' ? 'No active injuries. Stay safe!' : 'No injuries on record.'}
            </div>
          ) : (
            shownInjuries.map((i) => (
              <div key={i._id} className="injury-record">
                <div className="injury-record-head">
                  <div>
                    <strong>
                      {i.bodyPart} ({i.side}) — {i.injuryType}
                    </strong>
                    <div className="injury-record-meta">
                      {new Date(i.date).toISOString().slice(0, 10)} · {i.severity}{i.mechanism ? ` · ${i.mechanism}` : ''}
                    </div>
                  </div>
                  <span className={badgeClassFor(i.recoveryStatus)}>{i.recoveryStatus}</span>
                </div>
                {i.notes && <div className="injury-record-notes">{i.notes}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
