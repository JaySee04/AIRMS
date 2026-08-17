'use client';

// Admin · Personnel. One place to manage every non-athlete staff account:
// create a coach (read-only, scoped to one sport) or a medical staffer
// (per-feature permissions, opt-out model), change a coach's sport, tune a
// medical staffer's capabilities, and activate/deactivate any account. Merges
// the former separate "Coaches" and "Staff Permissions" pages (2026-08-01).

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { ISN_SPORTS } from '@/lib/sports';
import SportSelect from '@/components/ui/SportSelect';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

type Role = 'coach' | 'medical';

interface StaffUser {
  _id: string;
  id: number;
  name: string;
  email: string;
  role: Role;
  coachSport: string | null;
  isActive: boolean;
  permissions: Record<string, boolean> | null;
  lastLoginAt: string | null;
}

interface PermissionMeta { keys: string[]; labels: Record<string, string>; }

// A capability is granted unless explicitly set to false (opt-out model).
function granted(perms: Record<string, boolean> | null, key: string): boolean {
  if (!perms) return true;
  return perms[key] !== false;
}

export default function AdminPersonnelPage() {
  const [coaches, setCoaches] = useState<StaffUser[]>([]);
  const [medical, setMedical] = useState<StaffUser[]>([]);
  const [meta, setMeta] = useState<PermissionMeta | null>(null);
  const [sportDraft, setSportDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [role, setRole] = useState<Role>('coach');
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
      const [m, coachList, medList] = await Promise.all([
        api.get<PermissionMeta>('/users/permission-meta'),
        api.get<StaffUser[]>('/users?role=coach'),
        api.get<StaffUser[]>('/users?role=medical'),
      ]);
      setMeta(m);
      setCoaches(coachList);
      setMedical(medList);
      setSportDraft(Object.fromEntries(coachList.map((c) => [c.id, c.coachSport ?? ''])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load personnel');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sportRequired = role === 'coach';
  const canAdd = name.trim() && email.trim() && !validatePassword(password) && (!sportRequired || sport.trim());

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    const pwError = validatePassword(password);
    if (pwError) { setAddError(`Password: ${pwError.toLowerCase()}`); setAddMsg(null); return; }
    setAdding(true); setAddError(null); setAddMsg(null);
    try {
      await api.post<StaffUser>('/users', {
        role, name, email, password,
        ...(role === 'coach' ? { coachSport: sport } : {}),
      });
      setAddMsg(role === 'coach'
        ? `Coach "${name.trim()}" created for ${sport.trim()}.`
        : `Medical staff "${name.trim()}" created with full access.`);
      setName(''); setEmail(''); setPassword(''); setSport('');
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setAdding(false);
    }
  }

  async function saveSport(coach: StaffUser) {
    const next = (sportDraft[coach.id] ?? '').trim();
    if (!next || next === coach.coachSport) return;
    setSavingId(coach._id); setError(null);
    try {
      await api.patch(`/users/${coach.id}`, { coachSport: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  }

  // Optimistic patch of one user in whichever list they belong to.
  async function patchUser(user: StaffUser, next: Partial<Pick<StaffUser, 'permissions' | 'isActive'>>) {
    const setList = user.role === 'coach' ? setCoaches : setMedical;
    const prevCoaches = coaches; const prevMedical = medical;
    setList((cur) => cur.map((u) => (u._id === user._id ? { ...u, ...next } : u)));
    setSavingId(user._id); setError(null);
    try {
      const updated = await api.patch<StaffUser>(`/users/${user.id}`, next);
      setList((cur) => cur.map((u) => (u._id === user._id ? { ...u, ...updated } : u)));
    } catch (e) {
      setCoaches(prevCoaches); setMedical(prevMedical); // rollback
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSavingId(null);
    }
  }

  function togglePermission(user: StaffUser, key: string) {
    const base: Record<string, boolean> = {};
    (meta?.keys ?? []).forEach((k) => { base[k] = granted(user.permissions, k); });
    base[key] = !granted(user.permissions, key);
    patchUser(user, { permissions: base });
  }

  const accountBadge = (u: StaffUser) => (
    <button
      type="button"
      className={u.isActive ? 'badge-low' : 'badge-high'}
      style={{ cursor: 'pointer', border: 'none' }}
      disabled={savingId === u._id}
      onClick={() => patchUser(u, { isActive: !u.isActive })}
      title={u.isActive ? 'Click to deactivate' : 'Click to reactivate'}
    >
      {u.isActive ? 'Active' : 'Inactive'}
    </button>
  );

  return (
    <DashboardLayout allowedRoles={['admin']} title="Personnel">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Add account */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Add Personnel</h2>
          <span className="card-sub">
            Create a coach (read-only, scoped to one sport) or a medical staff account (full access by default).
            The password must meet the AIRMS policy: at least {PASSWORD_MIN_LENGTH} characters, with upper + lower case, a number, and a symbol.
          </span>
        </div></div>
        {addError && <div className="alert alert-error">{addError}</div>}
        {addMsg && <div className="alert alert-success">{addMsg}</div>}
        <form onSubmit={addAccount}>
          <div className="form-row-2">
            <div className="form-group">
              <label>Role <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="coach">Coach — read-only, one sport</option>
                <option value="medical">Medical staff — clinical access</option>
              </select>
            </div>
            <div className="form-group">
              <label>Name <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Email <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@isn.gov.my" autoComplete="off" />
            </div>
            {sportRequired ? (
              <div className="form-group">
                <label>Assigned sport <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                <SportSelect sports={ISN_SPORTS} value={sport} onChange={setSport} placeholder="Search the ISN sports…" />
              </div>
            ) : (
              <div className="form-group">
                <label>Access</label>
                <input value="Full clinical access (tune below after creating)" disabled />
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Password <span style={{ color: 'var(--risk-high)' }}>*</span></label>
            <div className="password-input-wrap" style={{ maxWidth: 420 }}>
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
          <button type="submit" className="btn btn-gold" disabled={adding || !canAdd}>
            {adding ? 'Creating…' : `Create ${role === 'coach' ? 'coach' : 'medical staff'}`}
          </button>
        </form>
      </div>

      {/* Coaches */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Coaches</h2>
          <span className="card-sub">{coaches.length} coach{coaches.length === 1 ? '' : 'es'} · read-only, one sport each</span>
        </div></div>
        {loading ? (
          <p className="text-muted">Loading…</p>
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
                      <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{c.email}</div>
                      <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        {c.lastLoginAt ? `Last login ${new Date(c.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 200 }}>
                          <SportSelect
                            sports={ISN_SPORTS}
                            value={sportDraft[c.id] ?? ''}
                            onChange={(s) => setSportDraft((p) => ({ ...p, [c.id]: s }))}
                            ariaLabel={`Assigned sport for ${c.name}`}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => saveSport(c)}
                          disabled={savingId === c._id || !(sportDraft[c.id] ?? '').trim() || (sportDraft[c.id] ?? '').trim() === c.coachSport}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{accountBadge(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Medical staff */}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Medical Staff Access</h2>
          <span className="card-sub">
            {medical.length} staff · every capability is on by default — uncheck to revoke a feature, or deactivate the account to block sign-in.
          </span>
        </div></div>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : medical.length === 0 ? (
          <div className="empty-state">No medical staff accounts yet. Add one above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  {meta?.keys.map((k) => (
                    <th key={k} style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>{meta.labels[k]}</th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Account</th>
                </tr>
              </thead>
              <tbody>
                {medical.map((u) => (
                  <tr key={u._id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{u.email}</div>
                      <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        {u.lastLoginAt ? `Last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}
                      </div>
                    </td>
                    {meta?.keys.map((k) => (
                      <td key={k} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={granted(u.permissions, k)}
                          disabled={savingId === u._id || !u.isActive}
                          onChange={() => togglePermission(u, k)}
                          aria-label={`${meta.labels[k]} for ${u.name}`}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>{accountBadge(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </DashboardLayout>
  );
}
