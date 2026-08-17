'use client';

// Coach · Reports. A focused version of the admin PDF-reports page, scoped to
// the coach's ONE assigned sport: pull an individual athlete's screening report
// (searched by name — no one remembers athlete IDs) or the whole team report.
// A date window (default last 30 days, adjustable) bounds the trend section of
// the individual report and which screening the team report reads per athlete;
// the most recent screening is always the primary, so the reports are never
// empty even if the last import was months ago.

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import AthleteSearchSelect, { PickableAthlete } from '@/components/ui/AthleteSearchSelect';

interface ReadinessResponse { sport: string | null; athletes: Array<{ athleteId: string; name: string }>; }

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CoachReportsPage() {
  const [sport, setSport] = useState<string | null>(null);
  const [squad, setSquad] = useState<PickableAthlete[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState(() => daysAgoISO(30));
  const [to, setTo] = useState(() => todayISO());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ReadinessResponse>('/coach/readiness');
      setSport(res.sport);
      setSquad((res.athletes ?? []).map((a) => ({ athleteId: a.athleteId, name: a.name, sport: res.sport ?? undefined })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your squad');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const range = () => `from=${from}&to=${to}`;

  async function dl(kind: string, path: string, filename: string) {
    setBusy(kind); setError(null);
    try { await api.downloadGet(path, filename); }
    catch (e) { setError(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(''); }
  }

  return (
    <DashboardLayout allowedRoles={['coach']} title="Reports">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Date window — shared by both reports */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Reporting window</h2>
          <span className="card-sub">
            Defaults to the last 30 days. The most recent screening is always shown; this window bounds the
            progress/trend a report includes.
          </span>
        </div></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="c-from">From</label>
            <input id="c-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="c-to">To</label>
            <input id="c-to" type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(daysAgoISO(30)); setTo(todayISO()); }}>Last 30 days</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(daysAgoISO(90)); setTo(todayISO()); }}>Last 90 days</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(daysAgoISO(365)); setTo(todayISO()); }}>Last year</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><p className="text-muted">Loading your squad…</p></div>
      ) : !sport ? (
        <div className="card"><div className="empty-state">No sport assigned to your account yet. An administrator assigns your sport.</div></div>
      ) : (
        <div className="grid-1-2" style={{ gap: 20 }}>
          {/* Individual */}
          <div className="card">
            <div className="card-header"><div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Individual report</h2>
              <span className="card-sub">One athlete from your {sport} squad · searched by name</span>
            </div></div>
            <div className="form-group">
              <label>Athlete</label>
              <AthleteSearchSelect athletes={squad} onSelect={setSelectedId} placeholder={`Search your ${squad.length}-athlete squad…`} />
              <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 2, minHeight: 14 }}>
                {selectedId ? `Selected · ${selectedId}` : 'Search and pick an athlete'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy !== '' || !selectedId}
              onClick={() => dl('i', `/screening-reports/individual/${selectedId}.pdf?${range()}`, `AIRMS-${selectedId}.pdf`)}
            >
              {busy === 'i' ? 'Preparing…' : 'Download individual report'}
            </button>
          </div>

          {/* Team */}
          <div className="card">
            <div className="card-header"><div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Team report</h2>
              <span className="card-sub">Your whole {sport} squad — ranking, attention table, squad heatmap</span>
            </div></div>
            <p className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
              Cohort-normed group report for <strong>{sport}</strong>, using the reporting window above.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy !== ''}
              onClick={() => dl('t', `/screening-reports/team.pdf?sport=${encodeURIComponent(sport)}&${range()}`, `AIRMS-team-${sport}.pdf`)}
            >
              {busy === 't' ? 'Preparing…' : 'Download team report'}
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
