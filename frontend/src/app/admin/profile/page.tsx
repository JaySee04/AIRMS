'use client';

import { useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileShell from '@/components/profile/ProfileShell';
import { api } from '@/lib/api';

interface AthleteListItem { athleteId: string; sport?: string; isActive?: boolean }
interface AnalyticsSummary {
  total: number;
  recovering: number;
  athletesAffected: number;
  sportsAffected: number;
}

function thisMonthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function AdminProfile() {
  // Admin sees the system-wide vitals: roster size, monthly case load, and how
  // diverse the sport coverage is. Mirrors the headline KPI cards on the
  // admin analytics dashboard but scoped to "right now".
  const loadStats = useCallback(async () => {
    const [athletes, summary, monthSummary] = await Promise.all([
      api.get<AthleteListItem[]>('/athletes'),
      api.get<AnalyticsSummary>('/injuries/analytics/summary'),
      api.get<AnalyticsSummary>(`/injuries/analytics/summary?startDate=${thisMonthStartISO()}`),
    ]);
    return [
      { label: 'Total athletes', value: athletes.filter((a) => a.isActive !== false).length, hint: 'Active roster' },
      { label: 'Sports covered', value: new Set(athletes.map((a) => a.sport).filter(Boolean)).size, hint: 'Distinct sports in DB' },
      { label: 'Injuries this month', value: monthSummary.total, hint: 'Since 1st of month' },
      { label: 'Currently recovering', value: summary.recovering, hint: 'Across all athletes' },
    ];
  }, []);

  return (
    <DashboardLayout allowedRoles={['admin']} title="My Profile">
      <ProfileShell
        stats={[
          { label: 'Total athletes', value: '…' },
          { label: 'Sports covered', value: '…' },
          { label: 'Injuries this month', value: '…' },
          { label: 'Currently recovering', value: '…' },
        ]}
        onLoadStats={loadStats}
        roleBlurb="System administrator — analytics, reporting, data management"
      />
    </DashboardLayout>
  );
}
