'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { SessionUser, PermissionKey, Role, hasPermission } from '@/lib/auth';

interface NavItem { href: string; label: string; icon: React.ReactNode; perm?: PermissionKey; }

const IconHome = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
);
const IconUpload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);
const IconBarChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconFileText = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconTrend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/>
  </svg>
);
const IconPulse = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

const NAV: Record<Role, NavItem[]> = {
  athlete: [
    { href: '/athlete/dashboard',     label: 'My Dashboard',      icon: <IconHome /> },
    { href: '/athlete/history',       label: 'Screening History', icon: <IconFileText /> },
    { href: '/athlete/squad',         label: 'My Squad',          icon: <IconUsers /> },
  ],
  medical: [
    { href: '/medical/dashboard',      label: 'Athlete Dashboard',  icon: <IconHome />,        perm: 'viewRecords' },
    { href: '/medical/cohort-norms',   label: 'Cohort Norms',       icon: <IconPulse />,       perm: 'editCohortNorms' },
    { href: '/medical/data-upload',    label: 'Data Uploading',     icon: <IconUpload />,      perm: 'uploadData' },
  ],
  admin: [
    { href: '/admin/dashboard',   label: 'Screening Analytics', icon: <IconBarChart /> },
    { href: '/admin/activity',    label: 'Programme Activity',  icon: <IconTrend /> },
    { href: '/admin/reports',     label: 'PDF Reports',        icon: <IconFileText /> },
    { href: '/admin/thresholds',  label: 'Cohort Norms',       icon: <IconPulse /> },
    { href: '/admin/personnel',   label: 'Personnel',          icon: <IconUsers /> },
    { href: '/admin/data-upload', label: 'Data Uploading',     icon: <IconUpload /> },
    { href: '/admin/audit',       label: 'Activity Log',       icon: <IconFileText /> },
  ],
  // Coach role (first-class 4th role) — read-only squad readiness for the assigned sport.
  coach: [
    { href: '/coach/dashboard', label: 'Squad Readiness', icon: <IconPulse /> },
    { href: '/coach/reports',   label: 'Reports',         icon: <IconFileText /> },
  ],
  // Executive — read-only oversight. The admin's two analytics surfaces and the
  // reports, and nothing that writes: no Cohort Norms, no Personnel, no Data
  // Uploading. The absence of those three entries IS the role.
  executive: [
    { href: '/admin/dashboard', label: 'Screening Analytics', icon: <IconBarChart /> },
    { href: '/admin/activity',  label: 'Programme Activity',  icon: <IconTrend /> },
    { href: '/admin/reports',   label: 'PDF Reports',         icon: <IconFileText /> },
    // Reading the activity log is oversight, not administration — it is the
    // one thing this role exists for.
    { href: '/admin/audit',     label: 'Activity Log',        icon: <IconFileText /> },
  ],
};

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  // Hide medical items the admin has revoked. perm-less items always show.
  const items = NAV[user.role].filter((item) => !item.perm || hasPermission(user, item.perm));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image src="/images/logo1.png" alt="ISN" width={50} height={56} quality={100} />
        <div>
          <div className="sidebar-brand-title">AIRMS</div>
          <div className="sidebar-brand-sub">SPORTS HEALTH</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link${pathname === item.href ? ' active' : ''}`}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
