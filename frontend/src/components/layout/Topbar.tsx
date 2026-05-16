'use client';

import { SessionUser } from '@/lib/auth';

interface TopbarProps {
  user: SessionUser;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
}

const ROLE_LABELS = { athlete: 'Athlete', medical: 'Medical Staff', admin: 'Administrator' };

export default function Topbar({ user, theme, onToggleTheme, onLogout }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-role-badge">{ROLE_LABELS[user.role]}</span>
      </div>
      <div className="topbar-right">
        <button
          className="btn-icon"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <span className="topbar-user">{user.name}</span>
        <button className="btn btn-outline btn-sm" onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
