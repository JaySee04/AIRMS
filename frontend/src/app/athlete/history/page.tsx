'use client';

// Athlete · Screening History (Module 3 / C2). The main dashboard always shows
// the LATEST screening; this page lets the athlete pick any PAST screening by its
// assessed date and see that screening's full dashboard. Reuses the same read-only
// dashboard components as /athlete/dashboard, fed a historical screening reshaped
// server-side by GET /api/screenings/:id/full. (The audit-fixed dashboard page is
// deliberately NOT refactored — this stands alone.)

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import { api } from '@/lib/api';
import { fmtScreeningDate } from '@/lib/periods';
import { getSession } from '@/lib/auth';
import type { AthleteRisks } from '@/lib/screeningAlerts';
import { RADAR_LABELS, highThresholdsFor, riskRadarSeries } from '@/lib/screeningAlerts';

const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });

interface FullScreening {
  athleteId: string; name: string; sport: string; age?: number; gender?: string;
  risks: AthleteRisks; myodynamia: MuscleEntry[]; tension: MuscleEntry[];
  overallActivityScore?: number; injuryRiskIndex?: number; mobility?: number; stability?: number; symmetry?: number;
  screening?: ScreeningIndicator | null;
}
interface HistoryRow { id: number; assessedAt: string | null; overallBand?: string | null; overrideBand?: string | null; }

const fmtDate = fmtScreeningDate;

export default function AthleteHistoryPage() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [full, setFull] = useState<FullScreening | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s?.user.athleteId) { setError('No athlete profile linked to this account.'); setLoading(false); return; }
    setAthleteId(s.user.athleteId);
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await api.get<HistoryRow[]>(`/screenings/athlete/${athleteId}`);
        if (cancelled) return;
        setRows(list);
        setSelectedId(list.length ? list[0].id : null);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  useEffect(() => {
    if (selectedId == null) { setFull(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const f = await api.get<FullScreening>(`/screenings/${selectedId}/full`);
        if (!cancelled) setFull(f);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load screening');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const riskValues = useMemo(() => (full ? riskRadarSeries(full.risks) : []), [full]);
  const riskThresholds = full ? highThresholdsFor(full.sport) : [];

  // This page always shows a chosen screening, and the first option IS the
  // latest — so unlike the staff views (where `picked` carries the signal) the
  // test is whether the selection is that first row. Selecting the latest here
  // shows the same screening My Dashboard does, so present tense is correct.
  const viewingPast = selectedId != null && rows.length > 0 && selectedId !== rows[0].id;

  return (
    <DashboardLayout allowedRoles={['athlete']} title="Screening History">
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening History</h2>
            <span className="card-sub">Pick a past screening to view its full dashboard — your latest is on My Dashboard.</span>
          </div>
        </div>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">{error ?? 'No screenings on record yet.'}</div>
        ) : (
          <div className="form-group" style={{ maxWidth: 420, marginBottom: 0 }}>
            <label>Screening date</label>
            <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} aria-label="Choose a screening date">
              {rows.map((r, i) => (
                <option key={r.id} value={r.id}>{fmtDate(r.assessedAt)}{i === 0 ? ' · latest' : ''}</option>
              ))}
            </select>
            {viewingPast && (
              <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: '6px 0 0' }}>
                Showing a past screening — everything below is as it stood on that date, not where
                you are now. Choose the latest, or open My Dashboard, for that.
              </p>
            )}
          </div>
        )}
      </div>

      {error && rows.length > 0 && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {full && (
        <>
          <OverallRiskBadge screening={full.screening} hero audience="self" historical={viewingPast} />
          <ScreeningAlertBanner risks={full.risks} sport={full.sport} band={full.screening?.effectiveBand} audience="self" historical={viewingPast} />

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
                <span className="card-sub">Lower is better · closer to the centre is better</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
                <RiskRadar labels={RADAR_LABELS} values={riskValues} thresholds={riskThresholds} />
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-md)', lineHeight: 1.5 }}>
                  Each spoke is one exercise-risk indicator from this screening, on a 0–30 scale. The dashed
                  red line is your Elevated threshold for each region — a spoke crossing it flags that region.
                </p>
              </div>
            </div>
          </div>

          <div style={{ height: 20 }} />

          <ScreeningPanel athlete={{ ...full, subitems: full.screening?.subitems }} historical={viewingPast} />

          <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
                <span className="card-sub">L = left · R = right · B = both</span>
              </div>
            </div>
            <BodyMap myodynamia={full.myodynamia ?? []} tension={full.tension ?? []} subitems={full.screening?.subitems} historical={viewingPast} />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
