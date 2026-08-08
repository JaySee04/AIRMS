'use client';

// Admin · PDF Reports. HoloMotion screening reports only — holistic (cohort),
// individual (searched by name), and team (by sport/programme/gender). The
// former injury PDF builder was removed 2026-08-02 (HoloMotion-only scope).

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import AthleteSearchSelect, { PickableAthlete } from '@/components/ui/AthleteSearchSelect';
import SportSelect from '@/components/ui/SportSelect';
import CohortFilters, { useCohortFilters } from '@/components/admin/CohortFilters';

export default function AdminReportsPage() {
  // The holistic report takes the same slicers as the analytics page, so an
  // administrator can pull the report for exactly the group under discussion
  // rather than always the whole institute. The report states its filters on
  // its own cover, so a printed copy stays self-describing.
  const hf = useCohortFilters();
  const [disciplines, setDisciplines] = useState<Array<{ sport: string; discipline: string }>>([]);
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
        const [rows, ds] = await Promise.all([
          api.get<PickableAthlete[]>('/athletes'),
          api.get<Array<{ sport: string; discipline: string }>>('/athletes/meta/disciplines').catch(() => []),
        ]);
        if (!cancelled) {
          setRoster(rows.map((a) => ({ athleteId: a.athleteId, name: a.name, sport: a.sport })));
          setDisciplines(ds);
        }
      } catch { /* picker still renders; roster just empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Sports that actually have athletes — the valid team-report targets (avoids
  // a free-text typo that 404s on an empty/misspelt group).
  const sports = useMemo(() => [...new Set(roster.map((r) => r.sport).filter(Boolean) as string[])].sort(), [roster]);

  async function dl(kind: string, path: string, filename: string) {
    setBusy(kind); setErr(null);
    try { await api.downloadGet(path, filename); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(''); }
  }

  return (
    <DashboardLayout allowedRoles={['admin', 'executive']} title="PDF Reports">
      <CohortFilters
        f={hf}
        sports={sports}
        disciplines={disciplines}
        showFocus
        note="Applies to the Holistic report. The individual and team reports carry their own scope."
      />

      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening Reports</h2>
          <span className="card-sub">Holistic, individual, and team — all cohort-normed</span>
        </div></div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="grid-3" style={{ gap: 16 }}>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Holistic {hf.active ? '(filtered)' : '(all athletes)'}</strong>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 8px' }}>
              Risk distribution, averages, programme activity and flagged athletes
              {hf.active ? ' — for the group selected above.' : ' — for every athlete. Use the filters above to narrow it.'}
            </p>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => dl('h', `/screening-reports/holistic.pdf${hf.query ? `?${hf.query}` : ''}`, 'AIRMS-holistic.pdf')}>{busy === 'h' ? '…' : 'Download'}</button>
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
            <div style={{ margin: '4px 0' }}>
              <SportSelect sports={sports} value={sport} onChange={setSport} placeholder="Search sports…" />
            </div>
            <div style={{ display: 'flex', gap: 6, margin: '4px 0', flexWrap: 'wrap' }}>
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
