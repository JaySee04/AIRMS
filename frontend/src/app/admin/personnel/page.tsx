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
  // Null on both = an account whose password somebody typed directly (every
  // seeded one). invitedAt set with activatedAt still null = invited and not
  // yet taken up, which is the state an administrator has to act on.
  invitedAt: string | null;
  activatedAt: string | null;
}

/** Has this person been invited and not yet set a password? */
function isPending(u: StaffUser): boolean {
  return Boolean(u.invitedAt) && !u.activatedAt;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
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
  // Invitation is the default: the alternative means a credential travels over
  // WhatsApp and the administrator knows it for ever. Setting one by hand stays
  // available for a demo account, or for somebody with no working mailbox yet.
  const [byInvite, setByInvite] = useState(true);
  const [invitingId, setInvitingId] = useState<number | null>(null);
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
  const canAdd = name.trim() && email.trim() && (byInvite || !validatePassword(password)) && (!sportRequired || sport.trim());

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!byInvite) {
      const pwError = validatePassword(password);
      if (pwError) { setAddError(`Password: ${pwError.toLowerCase()}`); setAddMsg(null); return; }
    }
    setAdding(true); setAddError(null); setAddMsg(null);
    try {
      const created = await api.post<StaffUser & { invited?: boolean; inviteError?: string }>('/users', {
        role, name, email, invite: byInvite,
        ...(byInvite ? {} : { password }),
        ...(role === 'coach' ? { coachSport: sport } : {}),
      });
      const who = role === 'coach' ? `Coach "${name.trim()}"` : `Medical staff "${name.trim()}"`;
      // The account exists either way; whether the person can be reached is the
      // part worth reporting, because it decides what the administrator does
      // next — nothing, or re-send.
      if (byInvite && created.invited === false) {
        setAddError(`${who} was created, but the invitation could not be sent${created.inviteError ? `: ${created.inviteError}` : ''}. Use "Resend invite" below.`);
      }
      setAddMsg(byInvite
        ? (created.invited === false ? null : `${who} created — an activation code has been emailed to ${email.trim()}.`)
        : `${who} created with the password you set.`);
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

  async function resendInvite(u: StaffUser) {
    setInvitingId(u.id);
    setError(null);
    try {
      const updated = await api.post<StaffUser>(`/users/${u.id}/invite`, {});
      const setList = u.role === 'coach' ? setCoaches : setMedical;
      setList((cur) => cur.map((x) => (x._id === u._id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the invitation');
    } finally {
      setInvitingId(null);
    }
  }

  // The line under a person's name that says where they are in onboarding.
  //
  // "Never signed in" was the only signal before, and it cannot distinguish
  // somebody who was invited an hour ago from somebody invited three weeks ago
  // who never responded — which are the two cases with completely different
  // answers. An invitation that has been sitting for days is the one thing on
  // this page an administrator has to chase.
  const onboardingLine = (u: StaffUser) => {
    if (isPending(u)) {
      const d = daysSince(u.invitedAt as string);
      return (
        <span style={{ color: 'var(--risk-moderate)' }}>
          Invited {d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`} · not yet activated
        </span>
      );
    }
    if (u.lastLoginAt) return `Last login ${new Date(u.lastLoginAt).toLocaleDateString()}`;
    return 'Never signed in';
  };

  // Offered while the account carries no activation — either never invited (a
  // seeded account whose password was typed directly) or invited and not yet
  // taken up. Gone once they have joined.
  //
  // It used to render for everyone, labelled "Send invite" for people who had
  // joined weeks earlier. Three things were wrong with that, and the button was
  // the least of them: re-sending overwrote `invitedAt`, so the record claimed
  // somebody was invited AFTER they activated; and the mail it sent says "an
  // account has been created for you ... to finish setting up", which to an
  // existing member reads as a duplicate account or as phishing.
  //
  // Nothing is lost. An activated user who is locked out uses "Forgot password?"
  // on the login page, which sends the mail written for that situation, with the
  // short TTL that suits it.
  const inviteButton = (u: StaffUser) => (u.activatedAt ? null : (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      disabled={invitingId === u.id || !u.isActive}
      onClick={() => resendInvite(u)}
      title={isPending(u)
        ? 'Send a fresh activation code — the previous one stops working'
        : 'Email an activation code so they can set their own password'}
    >
      {invitingId === u.id ? 'Sending…' : isPending(u) ? 'Resend invite' : 'Send invite'}
    </button>
  ));

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
            <label>How they get access</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontWeight: 400 }}>
                <input type="radio" checked={byInvite} onChange={() => setByInvite(true)} />
                {' '}Email them an activation code <strong>(recommended)</strong>
              </label>
              <label style={{ fontWeight: 400 }}>
                <input type="radio" checked={!byInvite} onChange={() => setByInvite(false)} />
                {' '}Set a password myself
              </label>
              <p className="card-sub" style={{ margin: 0 }}>
                {byInvite
                  ? 'They choose their own password from the code. Nobody here ever knows it, and the code expires in 7 days.'
                  : 'You will have to pass this password to them somehow, and you will know it afterwards. Use only for a demo account or somebody with no working mailbox.'}
              </p>
            </div>
          </div>
          <div className="form-group" style={{ display: byInvite ? 'none' : undefined }}>
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
                        {onboardingLine(c)}
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
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                        {accountBadge(c)}
                        {inviteButton(c)}
                      </div>
                    </td>
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
                        {onboardingLine(u)}
                      </div>
                    </td>
                    {meta?.keys.map((k) => (
                      <td key={k} style={{ textAlign: 'center' }}>
                        {/* A bare 18px checkbox is under the 24px touch target, and in a
                            matrix the column header is the visible label — so the target
                            is a padded wrapper that forwards the click, rather than
                            visible text that would wreck the grid. */}
                        <label className="matrix-check">
                          <input
                            type="checkbox"
                            checked={granted(u.permissions, k)}
                            disabled={savingId === u._id || !u.isActive}
                            onChange={() => togglePermission(u, k)}
                            aria-label={`${meta.labels[k]} for ${u.name}`}
                          />
                        </label>
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                        {accountBadge(u)}
                        {inviteButton(u)}
                      </div>
                    </td>
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
