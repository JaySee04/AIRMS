'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningReport, { ScreeningAthlete } from '@/components/dashboard/ScreeningReport';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

export default function AthleteScreeningPage() {
  const [athlete, setAthlete] = useState<ScreeningAthlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session?.user.athleteId) {
      setError('No athlete profile linked to this account.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const a = await api.get<ScreeningAthlete>(`/athletes/${session.user.athleteId}`);
        setAthlete(a);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load screening data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardLayout allowedRoles={['athlete']} title="Screening Report">
      {loading && <p className="text-muted">Loading screening data…</p>}
      {error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && athlete && <ScreeningReport athlete={athlete} />}
    </DashboardLayout>
  );
}
