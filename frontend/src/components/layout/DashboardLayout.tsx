'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { api } from '@/lib/api';
import {
  getSession, saveSession, clearSession,
  SessionUser, PermissionKey, Role, hasPermission, firstPermittedPath,
} from '@/lib/auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles: Role[];
  title: string;
  // When set, medical staff lacking this capability are routed to their first
  // still-permitted page — revoked features simply don't exist for them (no
  // sidebar entry, no dead-end denial page). athlete/admin are unaffected.
  requiredPermission?: PermissionKey;
}

export default function DashboardLayout({ children, allowedRoles, title, requiredPermission }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Off-canvas navigation below the desktop breakpoint. The sidebar is a fixed
  // 256px column that the main area is margin-offset by, with no breakpoint —
  // so on a tablet the content started 256px off-screen and every page scrolled
  // sideways. Desktop is unchanged; this only governs the narrow layout.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session || !allowedRoles.includes(session.user.role)) {
      router.replace('/');
      return;
    }
    setUser(session.user);
    const saved = localStorage.getItem('airms_theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);

    // Permissions are admin-editable at any time, but the session user in
    // localStorage is a login-time snapshot. Refresh it from the server so a
    // revocation takes effect on the staffer's next navigation, not their
    // next login. Backend routes enforce live permissions regardless — this
    // keeps the UI (sidebar, page gates) in agreement with them.
    if (session.user.role === 'medical') {
      api.get<{ user: SessionUser }>('/auth/me')
        .then(({ user: fresh }) => {
          saveSession(session.token, fresh);
          setUser(fresh);
        })
        .catch(() => null); // offline/expired: keep the snapshot; API gates still hold
    }
  }, [allowedRoles, router]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('airms_theme', theme);
  }, [theme]);

  // Route away from pages whose capability has been revoked.
  const blocked = user && requiredPermission ? !hasPermission(user, requiredPermission) : false;
  useEffect(() => {
    if (user && blocked) router.replace(firstPermittedPath(user));
  }, [user, blocked, router]);

  // Navigating closes the drawer — otherwise it stays over the page the user
  // just asked for.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Escape closes it, which is what a keyboard user expects of anything that
  // covers the page.
  useEffect(() => {
    if (!navOpen) return undefined;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setNavOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  if (!user) return null;

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <Sidebar user={user} />
      {/* Tapping away from an open drawer closes it. Rendered only while open so
          it can never intercept clicks on the desktop layout. */}
      {navOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="main-area">
        <Topbar
          user={user}
          title={title}
          theme={theme}
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((o) => !o)}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onLogout={handleLogout}
        />
        <main className="page-content">
          {blocked ? null : children}
        </main>
      </div>
    </div>
  );
}
