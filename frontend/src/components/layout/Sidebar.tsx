'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: Record<'athlete' | 'medical' | 'admin', NavItem[]> = {
  athlete: [
    { href: '/athlete/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/athlete/activity', label: 'Activity Log', icon: '🏋️' },
    { href: '/athlete/injury-report', label: 'Injury Report', icon: '🩹' },
    { href: '/athlete/profile', label: 'My Profile', icon: '👤' },
  ],
  medical: [
    { href: '/medical/dashboard', label: 'Athlete Monitor', icon: '🔍' },
    { href: '/medical/injury-log', label: 'Injury Log', icon: '📋' },
    { href: '/medical/review-reports', label: 'Review Reports', icon: '✅' },
    { href: '/medical/data-upload', label: 'Data Upload', icon: '📤' },
    { href: '/medical/profile', label: 'My Profile', icon: '👤' },
  ],
  admin: [
    { href: '/admin/dashboard', label: 'Analytics', icon: '📈' },
    { href: '/admin/reports', label: 'Reports', icon: '📄' },
    { href: '/admin/data-upload', label: 'Data Upload', icon: '📤' },
    { href: '/admin/profile', label: 'My Profile', icon: '👤' },
  ],
};

export default function Sidebar({ role }: { role: 'athlete' | 'medical' | 'admin' }) {
  const pathname = usePathname();
  const items = NAV[role];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image src="/images/logo1.png" alt="ISN" width={36} height={36} />
        <span className="sidebar-brand-text">AIRMS</span>
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
