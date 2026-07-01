'use client';

// Admin · Staff Permissions. Lists medical staff and lets the admin revoke
// individual capabilities (opt-out model: everything is on unless unchecked)
// or deactivate the account entirely. Saves are per-toggle and optimistic.

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface StaffUser {
  _id: string;
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  permissions: Record<string, boolean> | null;
  lastLoginAt: string | null;
}

interface PermissionMeta {
  keys: string[];
  labels: Record<string, string>;
}

// A capability is granted unless explicitly set to false (opt-out).
function granted(perms: Record<string, boolean> | null, key: string): boolean {
  if (!perms) return true;
  return perms[key] !== false;
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [meta, setMeta] = useState<PermissionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, list] = await Promise.all([
          api.get<PermissionMeta>('/users/permission-meta'),
          api.get<StaffUser[]>('/users?role=medical'),
        ]);
        setMeta(m);
        setStaff(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load staff');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist a change for one user, optimistically updating local state and
  // rolling back on failure.
  async function save(user: StaffUser, next: Partial<Pick<StaffUser, 'permissions' | 'isActive'>>) {
    const prev = staff;
    const optimistic = staff.map((u) => (u._id === user._id ? { ...u, ...next } : u));
    setStaff(optimistic);
    setSavingId(user._id);
    setError(null);
    try {
      const updated = await api.patch<StaffUser>(`/users/${user.id}`, next);
      setStaff((cur) => cur.map((u) => (u._id === user._id ? { ...u, ...updated } : u)));
    } catch (e) {
      setStaff(prev); // rollback
      setError(e instanceof Error ? e.message : 'Failed to save change');
    } finally {
      setSavingId(null);
    }
  }

  function togglePermission(user: StaffUser, key: string) {
    const current = granted(user.permissions, key);
    const base: Record<string, boolean> = {};
    // Build a full explicit map so the stored value is unambiguous.
    (meta?.keys ?? []).forEach((k) => { base[k] = granted(user.permissions, k); });
    base[key] = !current;
    save(user, { permissions: base });
  }

  return (
    <DashboardLayout allowedRoles={['admin']} title="Staff Permissions">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Medical Staff Access Control</h2>
            <span className="card-sub">
              Every capability is enabled by default. Uncheck to revoke a feature for that staff member,
              or deactivate the account to block sign-in entirely.
            </span>
          </div>
        </div>

        {loading ? (
          <p className="text-muted">Loading staff…</p>
        ) : staff.length === 0 ? (
          <div className="empty-state">No medical staff accounts found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  {meta?.keys.map((k) => (
                    <th key={k} style={{ textAlign: 'center', fontSize: '0.78rem' }}>{meta.labels[k]}</th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Account</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u._id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{u.email}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
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
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={u.isActive ? 'badge-low' : 'badge-high'}
                        style={{ cursor: 'pointer', border: 'none' }}
                        disabled={savingId === u._id}
                        onClick={() => save(u, { isActive: !u.isActive })}
                        title={u.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                      >
                        {u.isActive ? 'Active' : 'Inactive'}
                      </button>
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
