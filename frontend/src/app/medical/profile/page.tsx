'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface RosterCounts { active: number; screened: number; awaiting: number; sports: number }

export default function MedicalProfile() {
  // At-a-glance stats relevant to a clinician: who's under care and screening
  // coverage across the roster.
  //
  // COUNTED SERVER-SIDE (§147). This pulled the whole of `GET /athletes` —
  // 44.2 KB, 28 keys a row on 62 athletes — and counted it here to show three
  // integers, which made this one of the heaviest pages in the app. Same shape
  // as §139, same fix: `/athletes/meta/counts` is ~60 bytes and uses the same
  // `isActive` scope, so the tiles cannot disagree with the roster.
  const loadStats = useCallback(async () => {
    const c = await api.get<RosterCounts>('/athletes/meta/counts');
    return [
      { label: 'Athletes under care', value: c.active, hint: 'Active roster' },
      { label: 'Screened', value: c.screened, hint: 'Have a HoloMotion report' },
      { label: 'Awaiting a screening', value: c.awaiting, hint: 'No report yet' },
    ];
  }, []);

  return (
    <DashboardLayout allowedRoles={['medical']} title="My Profile">
      <ProfileShell
        stats={[
          { label: 'Athletes under care', value: '…' },
          { label: 'Screened', value: '…' },
          { label: 'Awaiting a screening', value: '…' },
        ]}
        onLoadStats={loadStats}
        roleBlurb="Medical staff — HoloMotion screening review"
      />
    </DashboardLayout>
  );
}
