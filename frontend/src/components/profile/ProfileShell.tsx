'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearSession, getSession, SessionUser } from '@/lib/auth';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

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
  /** Optional role-specific content rendered below the standard chrome and
   *  above the account-actions modal. Used by the athlete profile for the
   *  Personal Information + Latest Screening Snapshot cards. */
  children?: React.ReactNode;
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
 * Password change is wired to POST /api/auth/change-password — same policy
 * (10 chars, mixed case, digit, symbol) as the email-reset flow.
 */
export default function ProfileShell({ stats: initialStats, onLoadStats, roleBlurb, children }: ProfileShellProps) {
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
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNext, setPwShowNext] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

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

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    const policyError = validatePassword(pwNext);
    if (policyError) {
      setPwMessage('error:' + policyError);
      return;
    }
    if (pwNext !== pwConfirm) {
      setPwMessage('error:New passwords do not match.');
      return;
    }
    if (pwNext === pwCurrent) {
      setPwMessage('error:New password must differ from your current password.');
      return;
    }
    setPwSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwCurrent, newPassword: pwNext });
      setPwMessage('success:Password updated. Use your new password on your next sign-in.');
      setPwCurrent(''); setPwNext(''); setPwConfirm('');
    } catch (err: unknown) {
      setPwMessage('error:' + (err instanceof Error ? err.message : 'Password change failed'));
    } finally {
      setPwSubmitting(false);
    }
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

      {/* Role-specific content slot (athlete uses this for Personal Info +
          Screening Snapshot; medical/admin leave it empty). */}
      {children && <div style={{ marginTop: 20 }}>{children}</div>}

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
                  <div className={
                    pwMessage.startsWith('error:')
                      ? 'alert alert-error'
                      : pwMessage.startsWith('success:')
                        ? 'alert alert-success'
                        : 'alert alert-info'
                  }>
                    {pwMessage.replace(/^(error|info|success):/, '')}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="pw-current">Current password</label>
                  <div className="password-input-wrap">
                    <input
                      id="pw-current"
                      type={pwShowCurrent ? 'text' : 'password'}
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setPwShowCurrent((v) => !v)}
                      aria-label={pwShowCurrent ? 'Hide password' : 'Show password'}
                      aria-pressed={pwShowCurrent}
                    >
                      {pwShowCurrent ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="pw-next">New password</label>
                  <div className="password-input-wrap">
                    <input
                      id="pw-next"
                      type={pwShowNext ? 'text' : 'password'}
                      value={pwNext}
                      onChange={(e) => setPwNext(e.target.value)}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      aria-describedby="pw-rules"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setPwShowNext((v) => !v)}
                      aria-label={pwShowNext ? 'Hide password' : 'Show password'}
                      aria-pressed={pwShowNext}
                    >
                      {pwShowNext ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {pwNext.length > 0 && (
                    <ul id="pw-rules" className="password-rules">
                      {passwordRules.map((rule) => {
                        const pass = rule.test(pwNext);
                        return (
                          <li key={rule.id} className={pass ? 'password-rule--pass' : 'password-rule--fail'}>
                            <span aria-hidden>{pass ? '✓' : '○'}</span> {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="pw-confirm">Confirm new password</label>
                  <div className="password-input-wrap">
                    <input
                      id="pw-confirm"
                      type={pwShowConfirm ? 'text' : 'password'}
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setPwShowConfirm((v) => !v)}
                      aria-label={pwShowConfirm ? 'Hide password' : 'Show password'}
                      aria-pressed={pwShowConfirm}
                    >
                      {pwShowConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPwModalOpen(false)} disabled={pwSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={pwSubmitting}>
                  {pwSubmitting ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
