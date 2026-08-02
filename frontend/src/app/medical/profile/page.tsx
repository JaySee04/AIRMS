'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface AthleteListItem { athleteId: string; isActive?: boolean; overallActivityScore?: number | null }

export default function MedicalProfile() {
  // At-a-glance stats relevant to a clinician: who's under care and screening
  // coverage across the roster.
  const loadStats = useCallback(async () => {
    const athletes = await api.get<AthleteListItem[]>('/athletes');
    const active = athletes.filter((a) => a.isActive !== false);
    const screened = active.filter((a) => a.overallActivityScore != null).length;
    return [
      { label: 'Athletes under care', value: active.length, hint: 'Active roster' },
      { label: 'Screened', value: screened, hint: 'Have a HoloMotion report' },
      { label: 'Awaiting a screening', value: active.length - screened, hint: 'No report yet' },
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
