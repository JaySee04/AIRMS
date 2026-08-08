'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface AthleteListItem { athleteId: string; sport?: string; isActive?: boolean; overallActivityScore?: number | null }

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
        roleBlurb="System administrator — screening analytics, reporting, data management"
      />
    </DashboardLayout>
  );
}
