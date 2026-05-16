'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { getSession, clearSession, SessionUser } from '@/lib/auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles: Array<'athlete' | 'medical' | 'admin'>;
  title: string;
}

export default function DashboardLayout({ children, allowedRoles, title }: DashboardLayoutProps) {
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

  return (
    <div className="app-shell">
      <Sidebar role={user.role} />
      <div className="main-area">
        <Topbar
          user={user}
          title={title}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onLogout={handleLogout}
        />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
