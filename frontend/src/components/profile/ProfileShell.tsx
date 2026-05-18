'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getSession, SessionUser } from '@/lib/auth';

interface StatTile {
  label: string;
  value: string | number;
  hint?: string;
}

interface ProfileShellProps {
  /** Role-specific stat tiles shown under the hero. */
  stats: StatTile[];
  /** Optional async loader for the stats above. */
  onLoadStats?: () => Promise<StatTile[]>;
  /** Long-form blurb under the role chip in the hero. */
  roleBlurb: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '??';
}

/**
 * Shared profile page chrome used by /medical/profile and /admin/profile.
 * Renders: hero (avatar + identity), stat tiles, account info, account actions.
 *
 * Password change is mocked — clicking the button shows a transient toast.
 * Real password rotation is out of scope until the backend exposes that flow.
 */
export default function ProfileShell({ stats: initialStats, onLoadStats, roleBlurb }: ProfileShellProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [stats, setStats] = useState<StatTile[]>(initialStats);
  const [loadingStats, setLoadingStats] = useState(!!onLoadStats);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session.user);
  }, []);

  useEffect(() => {
    if (!onLoadStats) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingStats(true);
        const next = await onLoadStats();
        if (!cancelled) {
          setStats(next);
          setStatsError(null);
        }
      } catch (e) {
        if (!cancelled) setStatsError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onLoadStats]);

  function handleSignOut() {
    if (!window.confirm('Sign out of AIRMS?')) return;
    clearSession();
    router.push('/');
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    if (pwNext !== pwConfirm) {
      setPwMessage('error:Passwords do not match.');
      return;
    }
    if (pwNext.length < 8) {
      setPwMessage('error:New password must be at least 8 characters.');
      return;
    }
    // The backend exposes no password-change endpoint yet — keep the form
    // honest about what just happened instead of pretending it did anything.
    setPwMessage('info:Demo build — password update is not wired to the server yet.');
    setPwCurrent(''); setPwNext(''); setPwConfirm('');
  }

  if (!user) {
    return <p className="text-muted">Loading profile…</p>;
  }

  return (
    <>
      {/* Hero */}
      <div className="card profile-hero">
        <div className="profile-hero-avatar">{getInitials(user.name)}</div>
        <div className="profile-hero-info">
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <div className="profile-hero-email">{user.email}</div>
          <div className="profile-hero-meta">
            <span className="role-chip">
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>{roleBlurb}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginTop: 20 }}>
        {stats.map((s) => (
          <div key={s.label} className="stat-tile">
            <div className="stat-tile-label">{s.label}</div>
            <div className="stat-tile-value">{loadingStats ? '…' : s.value}</div>
            {s.hint && <div className="stat-tile-delta">{s.hint}</div>}
          </div>
        ))}
      </div>
      {statsError && <div className="alert alert-error" style={{ marginTop: 12 }}>{statsError}</div>}

      {/* Account info + actions */}
      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2 className="card-title">Account information</h2>
          <div className="kv-grid">
            <div><span>Display name</span><strong>{user.name}</strong></div>
            <div><span>Email</span><strong>{user.email}</strong></div>
            <div><span>Role</span><strong>{user.role}</strong></div>
            {user.athleteId && (<div><span>Athlete ID</span><strong>{user.athleteId}</strong></div>)}
            <div><span>User ID</span><strong style={{ fontSize: '0.78rem' }}>{user.id}</strong></div>
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Account actions</h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Change your password, or sign out of this device.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn btn-outline" onClick={() => setPwModalOpen(true)}>
              Change password
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {pwModalOpen && (
        <div className="modal-backdrop" onClick={() => setPwModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Change password</h2>
              <button type="button" className="modal-close" onClick={() => setPwModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="modal-body">
                {pwMessage && (
                  <div className={pwMessage.startsWith('error:') ? 'alert alert-error' : 'alert alert-info'}>
                    {pwMessage.replace(/^(error|info):/, '')}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="pw-current">Current password</label>
                  <input
                    id="pw-current"
                    type="password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pw-next">New password</label>
                  <input
                    id="pw-next"
                    type="password"
                    value={pwNext}
                    onChange={(e) => setPwNext(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pw-confirm">Confirm new password</label>
                  <input
                    id="pw-confirm"
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPwModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
