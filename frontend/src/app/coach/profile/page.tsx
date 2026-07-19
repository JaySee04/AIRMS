'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface ReadinessAthlete {
  screening?: { effectiveBand?: 'green' | 'amber' | 'red' | null } | null;
  activeInjuries?: unknown[];
}
interface Readiness { sport: string | null; athletes: ReadinessAthlete[] }

export default function CoachProfile() {
  // A coach's profile vitals: their assigned sport and a quick read on the
  // squad they oversee (size, how many are Restricted, how many are injured).
  const loadStats = useCallback(async () => {
    const d = await api.get<Readiness>('/coach/readiness');
    const ath = d.athletes ?? [];
    const restricted = ath.filter((a) => a.screening?.effectiveBand === 'red').length;
    const injured = ath.filter((a) => (a.activeInjuries?.length ?? 0) > 0).length;
    return [
      { label: 'Assigned sport', value: d.sport ?? '—', hint: 'Set by an administrator' },
      { label: 'Squad size', value: ath.length, hint: 'Athletes in your sport' },
      { label: 'Restricted', value: restricted, hint: 'Immediate-assessment band' },
      { label: 'With active injuries', value: injured, hint: 'Recovering / chronic' },
    ];
  }, []);

  return (
    <DashboardLayout allowedRoles={['coach']} title="My Profile">
      <ProfileShell
        stats={[
          { label: 'Assigned sport', value: '…' },
          { label: 'Squad size', value: '…' },
          { label: 'Restricted', value: '…' },
          { label: 'With active injuries', value: '…' },
        ]}
        onLoadStats={loadStats}
        roleBlurb="Coach — read-only squad readiness for your assigned sport"
      />
    </DashboardLayout>
  );
}
