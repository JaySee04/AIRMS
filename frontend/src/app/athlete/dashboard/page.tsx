'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';

// Chart.js and the body-map path data are the heaviest client code on this
// page and render nothing on the server anyway — split them out so the
// dashboard shell paints without them.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningHistory from '@/components/dashboard/ScreeningHistory';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import type { AthleteRisks } from '@/lib/screeningAlerts';
import { RADAR_LABELS, highThresholdsFor, riskRadarSeries } from '@/lib/screeningAlerts';

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

export default function AthleteDashboard() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  // Own individual screening PDF — the backend's self-only check makes this
  // safe to expose (UC-39: Athlete, own report only).
  async function downloadMyReport() {
    if (!athleteId) return;
    setDlBusy(true); setDlError(null);
    try {
      await api.downloadGet(`/screening-reports/individual/${athleteId}.pdf`, `AIRMS-${athleteId}.pdf`);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDlBusy(false);
    }
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
        const a = await api.get<Athlete>(`/athletes/${athleteId}`);
        if (!cancelled) {
          setAthlete(a);
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

  // Axis order, labels and clamping all come from RADAR_AXES in
  // lib/screeningAlerts.ts — the single place that decides which indicators are
  // shown. spinalDiscHerniation (Lumbar Disc Herniation) is deliberately absent
  // there: it is extracted and stored, but excluded from every risk display per
  // Dr Thung — ISN's facilities don't support that assessment, so showing it
  // would imply a reading the institute cannot stand behind. See
  // MASTER_CLARIFICATIONS §6 and SHOWN_RISK_KEYS in backend/src/utils/cohorts.js
  // (the scoring counterpart).
  const riskValues = riskRadarSeries(athlete.risks);
  const riskThresholds = highThresholdsFor(athlete.sport);

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Dashboard">
      {/* NOTE: the sport-aware screening detail now sits BELOW the hero — it
          explains the band rather than competing with it. See the rationale in
          ScreeningAlertBanner.tsx. */}

      {/* PRIMARY risk signal — the cohort-normed HoloMotion indicator. This is
          the only risk verdict on the dashboard: the ACWR / composite training-
          load hero, its stat tiles and the workload chart were removed on
          2026-07-16, and Activity Tracking (Module 1 — sRPE session logging,
          the sole training-load input) was fully retired on 2026-07-20 along
          with the recovery-baseline trigger and prevention-insight card that
          depended on it. `lib/risk.ts` is kept (locked decision, per
          MASTER_CLARIFICATIONS §12) but has no live callers left on this
          page — see docs/fyp/ACWR_REBUILD.md for the model's own history. */}
      {/* The verdict is a full-width banner (a "Safe" athlete's hero is short —
          pairing it beside the taller radar left a dead gap). Flow reads
          verdict → why → overview → detail: the band, then the regions behind
          it, then the radar overview, then the full screening panel. */}
      <OverallRiskBadge screening={athlete.screening} hero audience="self" />

      {/* Which regions sit behind an amber/red band. Renders nothing when the
          athlete is green overall — their detail lives on the strips below. */}
      <ScreeningAlertBanner
        risks={athlete.risks}
        sport={athlete.sport}
        band={athlete.screening?.effectiveBand}
        audience="self"
      />

      {/* Risk radar — sits just above the threshold strips that plot the same
          indicators, so the two screening views read together. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
            <span className="card-sub">Lower is better</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
            <RiskRadar labels={RADAR_LABELS} values={riskValues} thresholds={riskThresholds} />
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 240 }}>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-md)', lineHeight: 1.5 }}>
              Each spoke is one exercise-risk indicator from your latest HoloMotion
              screening, on a 0–30 scale. <strong>Closer to the centre is better</strong> —
              a small, even shape means low risk across the board.
            </p>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
              The dashed red line is your Elevated threshold for each region —
              tightened for regions critical to your sport. A spoke crossing
              outside it flags that region. The exact values and what to do
              about them are in the screening panel below.
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* HoloMotion screening — gauges, indicator threshold strips, muscle
          flags. The full latest report, read against its thresholds, lives
          here on the dashboard rather than on a separate page. subitems live
          only on the fetched `.screening` sub-object (never duplicated onto
          the flat athlete row), so they're merged in here. */}
      <ScreeningPanel athlete={{ ...athlete, subitems: athlete.screening?.subitems }} />

      {/* Report-to-report progress + the athlete's own downloadable PDF (the
          same individual report medical/coach pull, self-only server-side). */}
      {dlError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{dlError}</div>}
      {athleteId && (
        <ScreeningHistory
          athleteId={athleteId}
          headerAction={(
            <button type="button" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={downloadMyReport} disabled={dlBusy}>
              {dlBusy ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
        />
      )}

      {/* Body map */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
            <span className="card-sub">L = left · R = right · B = both</span>
          </div>
        </div>
        <BodyMap myodynamia={athlete.myodynamia ?? []} tension={athlete.tension ?? []} subitems={athlete.screening?.subitems} />
      </div>
    </DashboardLayout>
  );
}
