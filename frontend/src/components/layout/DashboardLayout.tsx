'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { getSession, clearSession, SessionUser, PermissionKey, hasPermission } from '@/lib/auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles: Array<'athlete' | 'medical' | 'admin' | 'coach'>;
  title: string;
  // When set, medical staff lacking this capability see an access-denied
  // message instead of the page body. athlete/admin are unaffected.
  requiredPermission?: PermissionKey;
}

export default function DashboardLayout({ children, allowedRoles, title, requiredPermission }: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const session = getSession();
    if (!session || !allowedRoles.includes(session.user.role)) {
      router.replace('/');
      return;
    }
    setUser(session.user);
    const saved = localStorage.getItem('airms_theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);
  }, [allowedRoles, router]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('airms_theme', theme);
  }, [theme]);

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  if (!user) return null;

  const blocked = requiredPermission ? !hasPermission(user, requiredPermission) : false;

  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <div className="main-area">
        <Topbar
          user={user}
          title={title}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onLogout={handleLogout}
        />
        <main className="page-content">
          {blocked ? (
            <div className="alert alert-error">
              This feature has been disabled for your account by an administrator.
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
