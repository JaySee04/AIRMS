export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'athlete' | 'medical' | 'admin';
  athleteId?: string;
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
  allowedRoles: Array<'athlete' | 'medical' | 'admin'>
): SessionUser | null {
  const session = getSession();
  if (!session) return null;
  if (!allowedRoles.includes(session.user.role)) return null;
  return session.user;
}
