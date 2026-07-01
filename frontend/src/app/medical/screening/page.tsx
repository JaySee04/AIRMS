'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningReport, { ScreeningAthlete } from '@/components/dashboard/ScreeningReport';
import { api } from '@/lib/api';

interface AthleteListItem {
  athleteId: string;
  name: string;
  sport?: string;
}

export default function MedicalScreeningPage() {
  const [list, setList] = useState<AthleteListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [athlete, setAthlete] = useState<ScreeningAthlete | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await api.get<AthleteListItem[]>('/athletes');
        setList(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load athletes');
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) { setAthlete(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingReport(true);
      setError(null);
      try {
        const a = await api.get<ScreeningAthlete>(`/athletes/${selectedId}`);
        if (!cancelled) setAthlete(a);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load screening data');
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.name.toLowerCase().includes(q) || a.athleteId.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="viewRecords" title="Screening Reports">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 220px', marginBottom: 0 }}>
            <label>Search athletes</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or ID…"
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 260px', marginBottom: 0 }}>
            <label>Athlete</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
              <option value="">{loadingList ? 'Loading…' : 'Select an athlete…'}</option>
              {filtered.map((a) => (
                <option key={a.athleteId} value={a.athleteId}>
                  {a.name} ({a.athleteId}){a.sport ? ` · ${a.sport}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loadingReport && <p className="text-muted">Loading screening data…</p>}
      {!selectedId && !loadingReport && (
        <div className="empty-state">Select an athlete to view their HoloMotion screening report.</div>
      )}
      {athlete && !loadingReport && <ScreeningReport athlete={athlete} />}
    </DashboardLayout>
  );
}
