'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { SessionUser } from '@/lib/auth';
import { getInitials } from '@/lib/name';

interface TopbarProps {
  user: SessionUser;
  title: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  athlete: 'Athlete',
  medical: 'Medical Staff',
  admin: 'Administrator',
  coach: 'Coach',
};

const PROFILE_ROUTES: Record<string, string> = {
  athlete: '/athlete/profile',
  medical: '/medical/profile',
  admin: '/admin/profile',
  coach: '/coach/profile',
};

const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IconSun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconSignOut = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6,9 12,15 18,9"/>
  </svg>
);

export default function Topbar({ user, title, theme, onToggleTheme, onLogout }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="topbar-role-info">
          <span className="topbar-signed-in-label">Signed in as</span>
          <span className="topbar-role-name">{ROLE_LABELS[user.role]}</span>
        </div>

        <button className="topbar-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? <IconMoon /> : <IconSun />}
        </button>

        <div className="user-menu-wrap" ref={menuRef}>
          <button className="user-menu-trigger" onClick={() => setOpen((v) => !v)}>
            <div className="user-avatar">{getInitials(user.name)}</div>
            <span className="topbar-username">{user.name}</span>
            <span className="topbar-chevron"><IconChevron /></span>
          </button>

          {open && (
            <div className="user-dropdown-menu">
              <div className="user-dropdown-header">
                <p className="user-dropdown-name">{user.name}</p>
                <p className="user-dropdown-role">{ROLE_LABELS[user.role]}</p>
              </div>
              <Link
                href={PROFILE_ROUTES[user.role]}
                className="user-dropdown-item"
                onClick={() => setOpen(false)}
              >
                <IconUser /> My Profile
              </Link>
              <button className="user-dropdown-item" onClick={onLogout}>
                <IconSignOut /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
