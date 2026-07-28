'use client';

// Admin · Coaches. Manage the coach role (first-class 4th role): create a coach, assign
// their ONE sport, change it, or deactivate the account. A coach sees only the
// squad of their assigned sport (routes/coach.js). This is the UI counterpart to
// the seed-only coach setup — no reseed needed to add or reassign a coach.

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { ISN_SPORTS } from '@/lib/sports';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

interface CoachUser {
  _id: string;
  id: number;
  name: string;
  email: string;
  coachSport: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<CoachUser[]>([]);
  const [sportDraft, setSportDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  // Add-coach form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [sport, setSport] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<CoachUser[]>('/users?role=coach');
      setCoaches(list);
      setSportDraft(Object.fromEntries(list.map((c) => [c.id, c.coachSport ?? ''])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load coaches');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addCoach(e: React.FormEvent) {
    e.preventDefault();
    const pwError = validatePassword(password);
    if (pwError) { setAddError(`Password: ${pwError.toLowerCase()}`); setAddMsg(null); return; }
    setAdding(true); setAddError(null); setAddMsg(null);
    try {
      await api.post<CoachUser>('/users', { name, email, password, coachSport: sport });
      setAddMsg(`Coach "${name.trim()}" created for ${sport.trim()}.`);
      setName(''); setEmail(''); setPassword(''); setSport('');
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create coach');
    } finally {
      setAdding(false);
    }
  }

  async function saveSport(coach: CoachUser) {
    const next = (sportDraft[coach.id] ?? '').trim();
    if (!next || next === coach.coachSport) return;
    setSavingId(coach.id); setError(null);
    try {
      await api.patch(`/users/${coach.id}`, { coachSport: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(coach: CoachUser) {
    setSavingId(coach.id); setError(null);
    const prev = coaches;
    setCoaches((cur) => cur.map((c) => (c.id === coach.id ? { ...c, isActive: !c.isActive } : c)));
    try {
      await api.patch(`/users/${coach.id}`, { isActive: !coach.isActive });
    } catch (e) {
      setCoaches(prev); // rollback
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DashboardLayout allowedRoles={['admin']} title="Coaches">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Add coach */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Add a Coach</h2>
          <span className="card-sub">Creates a read-only coach account scoped to one sport. The password must meet the same policy as every AIRMS account (at least {PASSWORD_MIN_LENGTH} characters, with upper + lower case, a number, and a symbol).</span>
        </div></div>
        {addError && <div className="alert alert-error">{addError}</div>}
        {addMsg && <div className="alert alert-success">{addMsg}</div>}
        <form onSubmit={addCoach}>
          <div className="form-row-2">
            <div className="form-group">
              <label>Name <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Email <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@isn.gov.my" autoComplete="off" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Password <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <div className="password-input-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {password.length > 0 && (
                <ul className="password-rules">
                  {passwordRules.map((rule) => {
                    const pass = rule.test(password);
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
              <label>Assigned sport <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Type to search the 52 ISN sports…" list="isn-sports-coach" />
            </div>
          </div>
          <button type="submit" className="btn btn-gold" disabled={adding || !name.trim() || !email.trim() || Boolean(validatePassword(password)) || !sport.trim()}>
            {adding ? 'Creating…' : 'Create coach'}
          </button>
        </form>
      </div>

      {/* Coaches list */}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Coaches</h2>
          <span className="card-sub">{coaches.length} coach{coaches.length === 1 ? '' : 'es'} · one sport each</span>
        </div></div>
        {loading ? (
          <p className="text-muted">Loading coaches…</p>
        ) : coaches.length === 0 ? (
          <div className="empty-state">No coaches yet. Add one above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coach</th>
                  <th>Assigned sport</th>
                  <th style={{ textAlign: 'center' }}>Account</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((c) => (
                  <tr key={c._id} style={{ opacity: c.isActive ? 1 : 0.55 }}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{c.email}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {c.lastLoginAt ? `Last login ${new Date(c.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          value={sportDraft[c.id] ?? ''}
                          onChange={(e) => setSportDraft((p) => ({ ...p, [c.id]: e.target.value }))}
                          list="isn-sports-coach"
                          style={{ maxWidth: 200 }}
                          aria-label={`Assigned sport for ${c.name}`}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => saveSport(c)}
                          disabled={savingId === c.id || !(sportDraft[c.id] ?? '').trim() || (sportDraft[c.id] ?? '').trim() === c.coachSport}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={c.isActive ? 'badge-low' : 'badge-high'}
                        style={{ cursor: 'pointer', border: 'none' }}
                        disabled={savingId === c.id}
                        onClick={() => toggleActive(c)}
                        title={c.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                      >
                        {c.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <datalist id="isn-sports-coach">
        {ISN_SPORTS.map((s) => (<option key={s} value={s} />))}
      </datalist>
    </DashboardLayout>
  );
}
