'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

interface RosterCounts { active: number; screened: number; awaiting: number; sports: number }

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
  //
  // COUNTED SERVER-SIDE (§147). This pulled the whole of `GET /athletes` —
  // 44.2 KB on 62 athletes — to produce four integers. `/athletes/meta/counts`
  // is ~60 bytes and shares the `isActive` scope, so these tiles and the roster
  // cannot disagree.
  const loadStats = useCallback(async () => {
    const c = await api.get<RosterCounts>('/athletes/meta/counts');
    return [
      { label: 'Total athletes', value: c.active, hint: 'Active roster' },
      { label: 'Sports covered', value: c.sports, hint: 'Distinct sports in DB' },
      { label: 'Screened', value: c.screened, hint: 'Have a HoloMotion report' },
      { label: 'Awaiting a screening', value: c.awaiting, hint: 'No report yet' },
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
