export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'athlete' | 'medical' | 'admin' | 'coach';
  athleteId?: string;
  // Per-feature toggles for medical staff (opt-out model). null/undefined or a
  // missing key means the capability is granted. Only `false` blocks.
  permissions?: Record<string, boolean> | null;
}

// Feature keys the admin can revoke for individual medical staff. Mirrors
// backend/src/utils/permissions.js.
export type PermissionKey = 'viewRecords' | 'uploadData' | 'reviewReports' | 'injuryReports';

// True unless this is a medical user with the capability explicitly revoked.
// athlete/admin are never constrained by this layer.
export function hasPermission(user: SessionUser | null | undefined, key: PermissionKey): boolean {
  if (!user || user.role !== 'medical') return true;
  const perms = user.permissions;
  if (!perms) return true;
  return perms[key] !== false;
}

export function saveSession(token: string, user: SessionUser): void {
  localStorage.setItem('airms_token', token);
  localStorage.setItem('airms_user', JSON.stringify(user));
}

export function getSession(): { token: string; user: SessionUser } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('airms_token');
  const raw = localStorage.getItem('airms_user');
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) as SessionUser };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem('airms_token');
  localStorage.removeItem('airms_user');
}

export function requireRole(
  allowedRoles: Array<'athlete' | 'medical' | 'admin' | 'coach'>
): SessionUser | null {
  const session = getSession();
  if (!session) return null;
  if (!allowedRoles.includes(session.user.role)) return null;
  return session.user;
}
