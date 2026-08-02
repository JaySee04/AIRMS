'use client';

// Admin · PDF Reports. HoloMotion screening reports only — holistic (cohort),
// individual (searched by name), and team (by sport/programme/gender). The
// former injury PDF builder was removed 2026-08-02 (HoloMotion-only scope).

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface RosterAthlete { athleteId: string; name: string; sport?: string; }

export default function AdminReportsPage() {
  const [roster, setRoster] = useState<RosterAthlete[]>([]);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [sport, setSport] = useState('Badminton');
  const [programme, setProgramme] = useState('');
  const [gender, setGender] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<RosterAthlete[]>('/athletes');
        if (!cancelled) setRoster(rows.map((a) => ({ athleteId: a.athleteId, name: a.name, sport: a.sport })));
      } catch { /* the ID can still be typed directly */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve the typed value to an athlete ID: explicit ATHxxxx wins, else an
  // exact name match, else a unique case-insensitive prefix match.
  const resolveAthleteId = (q: string): string => {
    const raw = q.trim();
    const m = raw.match(/ATH\d+/i);
    if (m) return m[0].toUpperCase();
    const lower = raw.toLowerCase();
    const exact = roster.find((a) => a.name.toLowerCase() === lower);
    if (exact) return exact.athleteId;
    const hits = roster.filter((a) => a.name.toLowerCase().startsWith(lower));
    return hits.length === 1 ? hits[0].athleteId : '';
  };
  const resolvedId = resolveAthleteId(athleteQuery);

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
              <input value={athleteQuery} onChange={(e) => setAthleteQuery(e.target.value)} placeholder="Search by name…" list="report-athlete-roster" aria-label="Athlete name" />
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2, minHeight: 14 }}>
                {athleteQuery.trim() ? (resolvedId ? `→ ${resolvedId}` : 'No unique match yet') : 'Type a name (or an ATH id)'}
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== '' || !resolvedId} onClick={() => dl('i', `/screening-reports/individual/${resolvedId}.pdf`, `AIRMS-${resolvedId}.pdf`)}>{busy === 'i' ? '…' : 'Download'}</button>
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
        <datalist id="report-athlete-roster">
          {roster.map((a) => (<option key={a.athleteId} value={a.name}>{a.athleteId}{a.sport ? ` · ${a.sport}` : ''}</option>))}
        </datalist>
      </div>
    </DashboardLayout>
  );
}
