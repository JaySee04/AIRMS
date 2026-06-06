'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChangePasswordCard from '@/components/auth/ChangePasswordCard';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

// Athlete record shape used by this page. The fields that aren't displayed
// are still listed so the type guards the api.get() return value.
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

interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  athleteId?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
}

function fmt(value: unknown, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  return suffix ? `${value}${suffix}` : String(value);
}

function fmtScore(value: number | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export default function AthleteProfilePage() {
  const [athlete, setAthlete] = useState<AthleteRecord | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pull the fresh /me payload so createdAt and lastLoginAt are current.
        const meResp = await api.get<{ user: SessionUser }>('/auth/me');
        const me = meResp.user;
        if (cancelled) return;
        setUser(me);

        const athleteId = me.athleteId || getSession()?.user?.athleteId;
        if (!athleteId) {
          setError('No athlete record linked to your account. Contact your programme coordinator.');
          return;
        }
        const a = await api.get<AthleteRecord>(`/athletes/${athleteId}`);
        if (!cancelled) setAthlete(a);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const programme = athlete?.programme ?? athlete?.program;

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Profile">
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        Personal details and biometric data are maintained by the medical and administrative teams.
        If anything below is incorrect, please contact your physio or programme coordinator.
      </div>

      {loading ? (
        <p className="text-muted">Loading profile…</p>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : athlete && user ? (
        <div className="grid-2-1">
          {/* Left: Personal information */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Personal Information</h2>
              <span className="card-sub">Read-only · {athlete.athleteId}</span>
            </div>
            <div className="kv-grid" style={{ marginTop: 12 }}>
              <div><span>Full Name</span><strong>{athlete.name}</strong></div>
              <div><span>Athlete ID</span><strong>{athlete.athleteId}</strong></div>
              <div><span>Age</span><strong>{fmt(athlete.age, ' yrs')}</strong></div>
              <div><span>Gender</span><strong>{fmt(athlete.gender)}</strong></div>
              <div><span>Height</span><strong>{fmt(athlete.height, ' cm')}</strong></div>
              <div><span>Weight</span><strong>{fmt(athlete.weight, ' kg')}</strong></div>
              <div><span>Sport</span><strong>{fmt(athlete.sport)}</strong></div>
              <div><span>Programme</span><strong>{fmt(programme)}</strong></div>
            </div>
          </div>

          {/* Right: Account + screening snapshot */}
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2 className="card-title" style={{ marginBottom: 0 }}>Account</h2>
              </div>
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div><span>Email</span><strong>{user.email}</strong></div>
                <div><span>Role</span><strong style={{ textTransform: 'capitalize' }}>{user.role}</strong></div>
                <div><span>Joined</span><strong>{fmtDate(user.createdAt)}</strong></div>
                <div><span>Last Login</span><strong>{fmtDateTime(user.lastLoginAt)}</strong></div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title" style={{ marginBottom: 0 }}>Latest Screening Snapshot</h2>
                <span className="card-sub">From the most recent ISN screening</span>
              </div>
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div><span>Overall Activity Score</span><strong>{fmtScore(athlete.overallActivityScore)}</strong></div>
                <div><span>Injury Risk Index</span><strong>{fmtScore(athlete.injuryRiskIndex)}</strong></div>
                <div><span>Mobility</span><strong>{fmtScore(athlete.mobility)}</strong></div>
                <div><span>Stability</span><strong>{fmtScore(athlete.stability)}</strong></div>
                <div><span>Symmetry</span><strong>{fmtScore(athlete.symmetry)}</strong></div>
              </div>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 14, marginBottom: 0 }}>
                Screenings are scheduled on-site at ISN. Speak to your physio to confirm your next session.
              </p>
            </div>
          </div>

          {/* Change Password — spans both columns under the rest of the profile */}
          <div style={{ gridColumn: '1 / -1' }}>
            <ChangePasswordCard />
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
