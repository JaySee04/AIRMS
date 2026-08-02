'use client';

// Admin · PDF Reports. HoloMotion screening reports only — holistic (cohort),
// individual (searched by name), and team (by sport/programme/gender). The
// former injury PDF builder was removed 2026-08-02 (HoloMotion-only scope).

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import AthleteSearchSelect, { PickableAthlete } from '@/components/ui/AthleteSearchSelect';

export default function AdminReportsPage() {
  const [roster, setRoster] = useState<PickableAthlete[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [sport, setSport] = useState('Badminton');
  const [programme, setProgramme] = useState('');
  const [gender, setGender] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<PickableAthlete[]>('/athletes');
        if (!cancelled) setRoster(rows.map((a) => ({ athleteId: a.athleteId, name: a.name, sport: a.sport })));
      } catch { /* picker still renders; roster just empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function dl(kind: string, path: string, filename: string) {
    setBusy(kind); setErr(null);
    try { await api.downloadGet(path, filename); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(''); }
  }

  return (
    <DashboardLayout allowedRoles={['admin']} title="PDF Reports">
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening Reports</h2>
          <span className="card-sub">Cohort-normed PDF reports</span>
        </div></div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="grid-3" style={{ gap: 16 }}>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Holistic (all athletes)</strong>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 8px' }}>Cohort-wide risk distribution, averages, and flagged athletes.</p>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => dl('h', '/screening-reports/holistic.pdf', 'AIRMS-holistic.pdf')}>{busy === 'h' ? '…' : 'Download'}</button>
          </div>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Individual</strong>
            <div className="form-group" style={{ margin: '4px 0' }}>
              <AthleteSearchSelect athletes={roster} onSelect={setSelectedId} />
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2, minHeight: 14 }}>
                {selectedId ? `Selected · ${selectedId}` : 'Search and pick an athlete'}
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== '' || !selectedId} onClick={() => dl('i', `/screening-reports/individual/${selectedId}.pdf`, `AIRMS-${selectedId}.pdf`)}>{busy === 'i' ? '…' : 'Download'}</button>
          </div>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Team / group</strong>
            <div style={{ display: 'flex', gap: 6, margin: '4px 0', flexWrap: 'wrap' }}>
              <input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Sport" style={{ flex: '1 1 100px' }} />
              <select value={programme} onChange={(e) => setProgramme(e.target.value)}><option value="">Any prog</option><option>PODIUM</option><option>PELAPIS</option><option>OTHERS</option></select>
              <select value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Any gender</option><option>Male</option><option>Female</option></select>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== '' || !sport.trim()} onClick={() => {
              const q = new URLSearchParams({ sport: sport.trim(), ...(programme ? { programme } : {}), ...(gender ? { gender } : {}) });
              dl('t', `/screening-reports/team.pdf?${q}`, 'AIRMS-team.pdf');
            }}>{busy === 't' ? '…' : 'Download'}</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
