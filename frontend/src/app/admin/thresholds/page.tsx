'use client';

// Admin · Cohort Thresholds — the approval queue for the cohort norms every
// athlete's overall risk indicator is z-scored against (redesign spec §6).
// Computed mean/SD per (sport, programme, gender) are pre-filled; the admin
// tunes the settings, reviews each cohort, may edit the mean ("average
// threshold"), and approves. Only approved cohorts drive the indicator.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface Stat { mean: number; sd: number; n?: number; }
interface Cohort {
  id: number;
  sport: string;
  programme: string | null;
  gender: string | null;
  tier: 'spg' | 'sg' | 's' | 'all';
  n: number;
  stats: Record<string, Stat>;
  overrides: Record<string, Stat> | null;
  status: 'pending' | 'approved';
}
interface SettingsResp { settings: Record<string, number | boolean | string>; defaults: Record<string, number | boolean | string>; }

const COMPONENTS: Array<[string, string]> = [
  ['totalScore', 'Total Score'],
  ['rom', 'ROM'],
  ['stability', 'Stability'],
  ['symmetry', 'Symmetry'],
  ['riskGood', 'Risk (inverted)'],
  ['balance', 'L/R balance'],
];

const TIER_LABEL: Record<string, string> = {
  spg: 'Sport + Programme + Gender', sg: 'Sport + Gender', s: 'Sport', all: 'All athletes',
};

function cohortLabel(c: Cohort): string {
  if (c.tier === 'all') return 'All athletes';
  return [c.sport, c.programme, c.gender].filter(Boolean).join(' · ');
}

export default function CohortThresholdsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // `${id}.${comp}` -> mean
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cohorts to flag when arriving from the post-import prompt (?sport=A,B): the
  // cohorts touched by the just-imported screenings, so the admin lands on the
  // exact rows to recompute/approve.
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const highlightApplied = useRef(false);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        api.get<Cohort[]>('/cohorts'),
        api.get<SettingsResp>('/cohorts/settings/all'),
      ]);
      setCohorts(c);
      setSettings(s);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Once cohorts are loaded, if we arrived with ?sport=… (from the import
  // prompt), flash + scroll to the cohorts for those sports (plus the shared
  // "all" fallback). Runs once. Reads window.location directly to avoid pulling
  // useSearchParams (which would force a Suspense boundary on this page).
  useEffect(() => {
    if (highlightApplied.current || cohorts.length === 0 || typeof window === 'undefined') return;
    highlightApplied.current = true;
    const raw = new URLSearchParams(window.location.search).get('sport');
    if (!raw) return;
    const wanted = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    if (wanted.size === 0) return;
    const ids = cohorts
      .filter((c) => (c.sport && wanted.has(c.sport.toLowerCase())) || c.tier === 'all')
      .map((c) => c.id);
    if (ids.length === 0) return;
    setHighlightIds(new Set(ids));
    // Scroll the first matching row into view after paint.
    requestAnimationFrame(() => {
      document.getElementById(`cohort-${ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [cohorts]);

  async function recompute() {
    setBusy(true); setMsg(null); setError(null);
    try {
      const r = await api.post<{ cohorts: { cohorts: number }; indicators: { scored: number } }>('/cohorts/recompute', {});
      setMsg(`Recomputed ${r.cohorts.cohorts} cohorts; scored ${r.indicators.scored} athletes.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Recompute failed'); } finally { setBusy(false); }
  }

  async function saveSetting(key: string, value: number | boolean) {
    setBusy(true); setError(null);
    try {
      await api.patch('/cohorts/settings/all', { [key]: value });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function approve(c: Cohort, status: 'approved' | 'pending') {
    setBusy(true); setError(null);
    try {
      await api.patch(`/cohorts/${c.id}`, { status });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); } finally { setBusy(false); }
  }

  async function saveOverrides(c: Cohort) {
    setBusy(true); setError(null);
    try {
      const overrides: Record<string, Stat> = {};
      for (const [key] of COMPONENTS) {
        const base = (c.overrides?.[key] ?? c.stats[key]);
        if (!base) continue;
        const editKey = `${c.id}.${key}`;
        const mean = editKey in edits ? Number(edits[editKey]) : base.mean;
        overrides[key] = { mean, sd: base.sd, n: base.n };
      }
      await api.patch(`/cohorts/${c.id}`, { overrides });
      setMsg(`Saved edited thresholds for ${cohortLabel(c)}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  const set = settings?.settings ?? {};
  const usable = cohorts.filter((c) => c.n >= Number(set.min_cohort_n ?? 5));

  return (
    <DashboardLayout allowedRoles={['admin']} title="Cohort Thresholds">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      {/* Settings */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Norming Settings</h2>
          <span className="card-sub">Tune how cohorts are formed and how athletes escalate. Changes re-score everyone.</span>
        </div>
          <button type="button" className="btn btn-gold btn-sm" onClick={recompute} disabled={busy}>
            {busy ? 'Working…' : 'Recompute all'}
          </button>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-label">Min cohort size (n)</div>
            <input type="number" min={2} max={50} value={Number(set.min_cohort_n ?? 5)}
              onChange={(e) => saveSetting('min_cohort_n', Number(e.target.value))} style={{ width: 80 }} />
            <div className="stat-tile-delta">Smaller cohorts fall back a tier</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Bottom-k (worst) escalation</div>
            <input type="number" min={1} max={10} value={Number(set.bottom_k ?? 3)}
              onChange={(e) => saveSetting('bottom_k', Number(e.target.value))} style={{ width: 80 }} />
            <div className="stat-tile-delta">Worst k in cohort get +1 escalation</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Below-mean escalation</div>
            <div><label><input type="checkbox" checked={Boolean(set.escalation_below_mean)}
              onChange={(e) => saveSetting('escalation_below_mean', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">+1 when below cohort average</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Fallback ladder</div>
            <div><label><input type="checkbox" checked={Boolean(set.fallback_enabled)}
              onChange={(e) => saveSetting('fallback_enabled', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">spg → sg → s → all</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Per-indicator escalation</div>
            <div><label><input type="checkbox" checked={Boolean(set.escalation_indicator)}
              onChange={(e) => saveSetting('escalation_indicator', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">+1 when an indicator is Elevated <em>and</em> the athlete is a peer-outlier on it</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Active-injury floor</div>
            <div><label><input type="checkbox" checked={Boolean(set.escalation_injury)}
              onChange={(e) => saveSetting('escalation_injury', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">floors the band at amber when the athlete carries a significant active injury (moderate/severe, or chronic) — never red on its own</div>
          </div>
        </div>
      </div>

      {/* Cohort queue */}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Cohort Approval Queue</h2>
          <span className="card-sub">{usable.length} of {cohorts.length} cohorts meet the minimum size. Only approved cohorts drive the indicator.</span>
        </div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cohort</th><th>Tier</th><th style={{ textAlign: 'center' }}>n</th><th style={{ textAlign: 'center' }}>Status</th><th></th></tr></thead>
            <tbody>
              {cohorts.map((c) => (
                <Fragment key={c.id}>
                  <tr id={`cohort-${c.id}`} className={highlightIds.has(c.id) ? 'row-flash' : undefined}>
                    <td><strong>{cohortLabel(c)}</strong></td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{TIER_LABEL[c.tier]}</td>
                    <td style={{ textAlign: 'center', color: c.n >= Number(set.min_cohort_n ?? 5) ? 'inherit' : 'var(--risk-high)' }}>{c.n}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={c.status === 'approved' ? 'badge-low' : 'badge-moderate'}>{c.status}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                        {expanded === c.id ? 'Close' : 'Edit'}
                      </button>{' '}
                      {c.status === 'pending'
                        ? <button type="button" className="btn btn-primary btn-sm" onClick={() => approve(c, 'approved')} disabled={busy}>Approve</button>
                        : <button type="button" className="btn btn-outline btn-sm" onClick={() => approve(c, 'pending')} disabled={busy}>Revert</button>}
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg)' }}>
                        <div style={{ padding: '8px 4px' }}>
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                            Component means (the &quot;average thresholds&quot;) — pre-filled from the computed average; edit to override. SD stays computed.
                          </div>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            {COMPONENTS.map(([key, label]) => {
                              const base = c.overrides?.[key] ?? c.stats[key];
                              if (!base) return null;
                              const editKey = `${c.id}.${key}`;
                              return (
                                <div key={key} style={{ minWidth: 130 }}>
                                  <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{label} (μ)</label>
                                  <input type="number" step="0.1"
                                    value={editKey in edits ? edits[editKey] : String(base.mean)}
                                    onChange={(e) => setEdits((p) => ({ ...p, [editKey]: e.target.value }))} />
                                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>σ {base.sd}</div>
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" className="btn btn-gold btn-sm" style={{ marginTop: 10 }} onClick={() => saveOverrides(c)} disabled={busy}>Save edited thresholds</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
