'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

// Athlete record shape used by the personal-info + screening cards below
// the standard profile chrome.
interface AthleteRecord {
  athleteId: string;
  name: string;
  sport?: string;
  programme?: string;
  program?: string;
  age?: number;
  gender?: string;
  weight?: number;
  height?: number;
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
}

interface Injury { _id: string; recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic' }
interface SelfReport { _id: string; status: 'Pending' | 'Approved' | 'Rejected' }

function fmt(value: unknown, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  return suffix ? `${value}${suffix}` : String(value);
}

function fmtScore(value: number | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

export default function AthleteProfilePage() {
  const [athlete, setAthlete] = useState<AthleteRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load athlete record for the personal-info + screening cards. Account
  // chrome (avatar, email, role, last login etc.) is rendered by ProfileShell.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const athleteId = getSession()?.user?.athleteId;
        if (!athleteId) {
          setError('No athlete record linked to your account. Contact your programme coordinator.');
          return;
        }
        const a = await api.get<AthleteRecord>(`/athletes/${athleteId}`);
        if (!cancelled) setAthlete(a);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load athlete profile');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stats shown under the hero — biographical training-record counts that
  // give the athlete a quick sense of their footprint in the system.
  const loadStats = useCallback(async () => {
    const athleteId = getSession()?.user?.athleteId;
    if (!athleteId) return [];
    const [injs, reports] = await Promise.all([
      api.get<Injury[]>(`/injuries/athlete/${athleteId}`).catch(() => [] as Injury[]),
      api.get<SelfReport[]>('/self-reports/mine').catch(() => [] as SelfReport[]),
    ]);
    const activeInjuries = injs.filter((i) => i.recoveryStatus !== 'Recovered').length;
    const pendingReports = reports.filter((r) => r.status === 'Pending').length;
    return [
      { label: 'Active injuries', value: activeInjuries, hint: pendingReports > 0 ? `${pendingReports} self-report pending review` : 'Recovering or chronic' },
      { label: 'Self-reports pending', value: pendingReports, hint: 'Awaiting medical review' },
    ];
  }, []);

  const programme = athlete?.programme ?? athlete?.program;
  const roleBlurb = athlete?.sport
    ? `${athlete.sport}${programme ? ` · ${programme}` : ''}`
    : 'Athlete — training log and personal risk monitoring';

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Profile">
      {error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <ProfileShell
          stats={[
            { label: 'Active injuries', value: '…' },
            { label: 'Self-reports pending', value: '…' },
          ]}
          onLoadStats={loadStats}
          roleBlurb={roleBlurb}
        >
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            Personal details and biometric data are maintained by the medical and administrative teams.
            If anything below is incorrect, please contact your physio or programme coordinator.
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title" style={{ marginBottom: 0 }}>Personal Information</h2>
                <span className="card-sub">Read-only · {athlete?.athleteId ?? ''}</span>
              </div>
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div><span>Full Name</span><strong>{athlete?.name ?? '—'}</strong></div>
                <div><span>Athlete ID</span><strong>{athlete?.athleteId ?? '—'}</strong></div>
                <div><span>Age</span><strong>{fmt(athlete?.age, ' yrs')}</strong></div>
                <div><span>Gender</span><strong>{fmt(athlete?.gender)}</strong></div>
                <div><span>Height</span><strong>{fmt(athlete?.height, ' cm')}</strong></div>
                <div><span>Weight</span><strong>{fmt(athlete?.weight, ' kg')}</strong></div>
                <div><span>Sport</span><strong>{fmt(athlete?.sport)}</strong></div>
                <div><span>Programme</span><strong>{fmt(programme)}</strong></div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title" style={{ marginBottom: 0 }}>Latest Screening Snapshot</h2>
              </div>
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div><span>Overall Activity Score</span><strong>{fmtScore(athlete?.overallActivityScore)}</strong></div>
                <div><span>Injury Risk Index</span><strong>{fmtScore(athlete?.injuryRiskIndex)}</strong></div>
                <div><span>Mobility</span><strong>{fmtScore(athlete?.mobility)}</strong></div>
                <div><span>Stability</span><strong>{fmtScore(athlete?.stability)}</strong></div>
                <div><span>Symmetry</span><strong>{fmtScore(athlete?.symmetry)}</strong></div>
              </div>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 14, marginBottom: 0 }}>
                Screenings are scheduled on-site at ISN. Speak to your physio to confirm your next session.
              </p>
            </div>
          </div>
        </ProfileShell>
      )}
    </DashboardLayout>
  );
}
