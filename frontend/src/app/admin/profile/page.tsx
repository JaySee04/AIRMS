'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

interface AthleteListItem { athleteId: string; sport?: string; isActive?: boolean; overallActivityScore?: number | null }

// This page serves TWO roles, and the blurb must not describe the wrong one.
// It read "System administrator — screening analytics, reporting, data
// management" for both, so an executive — a role whose defining property is
// that it writes NOTHING, and which MASTER_CLARIFICATIONS §12 says must not be
// described as an administrator — was told it was one, on the page that states
// its identity. Read from the session snapshot rather than a prop because
// DashboardLayout owns the server confirmation; a wrong guess here is a
// sentence, not an access decision.
function roleBlurbFor(role: string | undefined): string {
  return role === 'executive'
    ? 'Executive oversight — institution-wide analytics, reporting and the activity log. Read-only.'
    : 'System administrator — screening analytics, reporting, data management';
}

export default function AdminProfile() {
  // Admin system-wide vitals: roster size, sport coverage, and HoloMotion
  // screening coverage. Mirrors the headline KPIs on the Screening Analytics
  // dashboard but scoped to "right now".
  const loadStats = useCallback(async () => {
    const athletes = await api.get<AthleteListItem[]>('/athletes');
    const active = athletes.filter((a) => a.isActive !== false);
    const screened = active.filter((a) => a.overallActivityScore != null).length;
    return [
      { label: 'Total athletes', value: active.length, hint: 'Active roster' },
      { label: 'Sports covered', value: new Set(active.map((a) => a.sport).filter(Boolean)).size, hint: 'Distinct sports in DB' },
      { label: 'Screened', value: screened, hint: 'Have a HoloMotion report' },
      { label: 'Awaiting a screening', value: active.length - screened, hint: 'No report yet' },
    ];
  }, []);

  return (
    <DashboardLayout allowedRoles={['admin', 'executive']} title="My Profile">
      <ProfileShell
        stats={[
          { label: 'Total athletes', value: '…' },
          { label: 'Sports covered', value: '…' },
          { label: 'Screened', value: '…' },
          { label: 'Awaiting a screening', value: '…' },
        ]}
        onLoadStats={loadStats}
        roleBlurb={roleBlurbFor(getSession()?.user.role)}
      />
    </DashboardLayout>
  );
}
