'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface AthleteListItem { athleteId: string; isActive?: boolean }
interface Injury { _id: string; recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic' }
interface SelfReport { _id: string; status: 'Pending' | 'Approved' | 'Rejected' }

export default function MedicalProfile() {
  // Load current at-a-glance stats relevant to a clinician: who's under care,
  // how much triage is waiting, and how many cases are still active.
  const loadStats = useCallback(async () => {
    const [athletes, injuries, reports] = await Promise.all([
      api.get<AthleteListItem[]>('/athletes'),
      api.get<Injury[]>('/injuries'),
      api.get<SelfReport[]>('/self-reports?status=Pending').catch(() => [] as SelfReport[]),
    ]);
    const recovering = injuries.filter((i) => i.recoveryStatus === 'Recovering').length;
    return [
      { label: 'Athletes under care', value: athletes.filter((a) => a.isActive !== false).length, hint: 'Active roster' },
      { label: 'Recovering injuries', value: recovering, hint: 'Across all athletes' },
      { label: 'Self-reports pending review', value: reports.length, hint: 'Awaiting your sign-off' },
      { label: 'Total injuries on record', value: injuries.length, hint: 'All-time' },
    ];
  }, []);

  return (
    <DashboardLayout allowedRoles={['medical']} title="My Profile">
      <ProfileShell
        stats={[
          { label: 'Athletes under care', value: '…' },
          { label: 'Recovering injuries', value: '…' },
          { label: 'Self-reports pending review', value: '…' },
          { label: 'Total injuries on record', value: '…' },
        ]}
        onLoadStats={loadStats}
        roleBlurb="Medical staff — clinical review and injury logging"
      />
    </DashboardLayout>
  );
}
