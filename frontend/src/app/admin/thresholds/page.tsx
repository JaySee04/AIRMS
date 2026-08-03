'use client';

// Admin · Cohort Norms — the reference distribution every athlete's overall
// risk indicator is z-scored against (redesign spec §6). A norm auto-generates
// and goes LIVE on every HoloMotion import (it's the cohort average by
// definition); the admin (or a permitted medical lead, via the API) can edit a
// mean to reflect real-life circumstances. When new data drifts from a manual
// edit, the cohort is flagged "review — new data" so the lead can keep or
// refresh it. The `norm_auto_overwrite` setting flips that to auto-refresh.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

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
  approvedBy?: string | null;
  review?: { needed: boolean; items: Array<{ component: string; manual: number; computed: number; delta: number }> };
}
interface SettingsResp { settings: Record<string, number | boolean | string>; defaults: Record<string, number | boolean | string>; }

// A cohort member row for the membership panel (B3/B4/B5).
interface Member {
  athleteId: string; name: string; program: string | null; gender: string | null;
  isInjured: boolean; normExcluded: boolean;
  totalScore: number | null; rom: number | null; stability: number | null; symmetry: number | null;
  overallBand: 'green' | 'amber' | 'red' | null; overallIndicator: number | null;
  eligible: boolean; reason: string | null;
}

const BAND_DOT: Record<string, string> = { green: 'var(--risk-low)', amber: 'var(--risk-moderate)', red: 'var(--risk-high)' };
const REASON_LABEL: Record<string, string> = {
  injured: 'Injured', excluded: 'Excluded (manual)', 'below-total': 'Below Total', 'below-rom': 'Below ROM', 'below-stability': 'Below Stability',
};

// Compact 0–100 score bar for the membership panel.
function ScoreBar({ v }: { v: number | null }) {
  const val = v ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 96 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, val))}%`, height: '100%', background: 'var(--brand-gold)' }} />
      </div>
      <span style={{ fontSize: '0.75rem', width: 24, textAlign: 'right' }}>{v == null ? '—' : val}</span>
    </div>
  );
}

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

interface Version { id: number; label: string; note: string | null; createdBy: string | null; createdAt: string; cohorts: number; }

export default function CohortThresholdsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // `${id}.${comp}` -> mean
  // Membership panel (B3/B4/B5): which cohort's members are open, and their rows.
  const [membersFor, setMembersFor] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersBusy, setMembersBusy] = useState(false);
  // Saved norm versions (B1).
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionName, setVersionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cohorts to flag when arriving from the post-import prompt (?sport=A,B): the
  // cohorts touched by the just-imported screenings, so the admin lands on the
  // exact rows to recompute/approve.
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const [showBelowMin, setShowBelowMin] = useState(false); // below-minimum cohorts don't drive the indicator — hidden by default
  const highlightApplied = useRef(false);
  // Norm-editing medical staff can reach this page too, but only edit norm
  // values — settings, notifications and queue governance stay admin-only.
  const isAdmin = getSession()?.user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const [c, s, v] = await Promise.all([
        api.get<Cohort[]>('/cohorts'),
        api.get<SettingsResp>('/cohorts/settings/all'),
        api.get<Version[]>('/cohorts/versions'),
      ]);
      setCohorts(c);
      setSettings(s);
      setVersions(v);
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
      setMsg(`Saved edited norm for ${cohortLabel(c)}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  // Drop the manual edit so the freshly computed norm governs again — the
  // "accept the new data" action for a drifted cohort.
  async function resetOverrides(c: Cohort) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/cohorts/${c.id}`, { overrides: {} });
      setEdits((p) => { const n = { ...p }; for (const [k] of COMPONENTS) delete n[`${c.id}.${k}`]; return n; });
      setMsg(`Reset ${cohortLabel(c)} to the computed norm.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Reset failed'); } finally { setBusy(false); }
  }

  // ── Membership panel (B3/B4/B5) ──────────────────────────────────────────
  const refreshMembers = useCallback(async (cohortId: number) => {
    const r = await api.get<{ members: Member[] }>(`/cohorts/${cohortId}/members`);
    setMembers(r.members);
  }, []);

  async function openMembers(c: Cohort) {
    if (membersFor === c.id) { setMembersFor(null); return; }
    setMembersFor(c.id); setMembers([]); setMembersBusy(true); setError(null);
    try { await refreshMembers(c.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load members'); }
    finally { setMembersBusy(false); }
  }

  // Toggle manual norm opt-out (B3) or injury (B4), then re-read so the eligible/
  // reason state (which depends on both + thresholds) is recomputed server-side.
  async function toggleExclude(m: Member) {
    if (membersFor == null) return;
    setError(null);
    try { await api.patch(`/cohorts/members/${m.athleteId}`, { normExcluded: !m.normExcluded }); await refreshMembers(membersFor); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }
  async function toggleInjury(m: Member) {
    if (membersFor == null) return;
    setError(null);
    try { await api.patch(`/athletes/${m.athleteId}/injury`, { isInjured: !m.isInjured }); await refreshMembers(membersFor); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }

  // ── Saved norm versions (B1) ─────────────────────────────────────────────
  async function saveVersion() {
    const label = versionName.trim();
    if (!label) return;
    setBusy(true); setError(null); setMsg(null);
    try { await api.post('/cohorts/versions', { label }); setVersionName(''); setMsg(`Saved norm version “${label}”.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }
  async function restoreVersion(v: Version) {
    if (!window.confirm(`Restore “${v.label}”? This replaces the current norms for ${v.cohorts} cohorts and re-scores every athlete.`)) return;
    setBusy(true); setError(null); setMsg(null);
    try { await api.post(`/cohorts/versions/${v.id}/restore`, {}); setMsg(`Restored “${v.label}”.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Restore failed'); } finally { setBusy(false); }
  }
  async function renameVersion(v: Version) {
    const input = window.prompt('Rename this norm version', v.label);
    if (input == null) return;
    const label = input.trim();
    if (!label) return;
    setBusy(true); setError(null);
    try { await api.patch(`/cohorts/versions/${v.id}`, { label }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Rename failed'); } finally { setBusy(false); }
  }
  async function deleteVersion(v: Version) {
    if (!window.confirm(`Delete the saved version “${v.label}”? The current live norms are unaffected.`)) return;
    setBusy(true); setError(null);
    try { await api.delete(`/cohorts/versions/${v.id}`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); } finally { setBusy(false); }
  }

  const set = settings?.settings ?? {};
  const usable = cohorts.filter((c) => c.n >= Number(set.min_cohort_n ?? 5));
  const belowMinCount = cohorts.length - usable.length;
  // Below-minimum cohorts don't drive the indicator, so hide them by default to
  // cut the scroll — but always show everything when a row is deep-linked
  // (highlighted from the import flow) so the target is never hidden.
  const shownCohorts = showBelowMin || highlightIds.size > 0 ? cohorts : usable;

  return (
    <DashboardLayout allowedRoles={['admin', 'medical']} requiredPermission="editCohortNorms" title="Cohort Norms">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      {/* Cohort norms — the norm VALUES. The Norming Settings + Email
          Notifications config now live on the admin Settings page (button
          below), so this page stays focused on the norms themselves. */}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Cohort Norms</h2>
          <span className="card-sub">
            {usable.length} of {cohorts.length} cohorts have enough athletes (n ≥ {Number(set.min_cohort_n ?? 5)}) to drive the indicator.
            Each norm auto-generates on import; edited norms that new data has moved are flagged <strong>review · new data</strong>.
          </span>
        </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {belowMinCount > 0 && highlightIds.size === 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowBelowMin((v) => !v)}>
                {showBelowMin ? `Hide ${belowMinCount} below-minimum` : `Show ${belowMinCount} below-minimum`}
              </button>
            )}
            <button type="button" className="btn btn-gold btn-sm" onClick={recompute} disabled={busy}>
              {busy ? 'Working…' : 'Recompute all'}
            </button>
            {isAdmin && <Link href="/admin/settings" className="btn btn-outline btn-sm">Settings</Link>}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cohort</th><th>Tier</th><th style={{ textAlign: 'center' }}>n</th><th>Norm</th><th></th></tr></thead>
            <tbody>
              {shownCohorts.map((c) => {
                const live = c.status === 'approved' && c.n >= Number(set.min_cohort_n ?? 5);
                const edited = Boolean(c.overrides && Object.keys(c.overrides).length);
                const needsReview = Boolean(c.review?.needed);
                return (
                <Fragment key={c.id}>
                  <tr id={`cohort-${c.id}`} className={highlightIds.has(c.id) ? 'row-flash' : undefined}>
                    <td><strong>{cohortLabel(c)}</strong></td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{TIER_LABEL[c.tier]}</td>
                    <td style={{ textAlign: 'center', color: c.n >= Number(set.min_cohort_n ?? 5) ? 'inherit' : 'var(--risk-high)' }}>{c.n}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.n < Number(set.min_cohort_n ?? 5)
                          ? <span className="text-muted" style={{ fontSize: '0.8rem' }}>insufficient data</span>
                          : <span className={live ? 'badge-low' : 'badge-moderate'}>{live ? 'Live' : 'Held'}</span>}
                        {edited && <span className="badge-moderate" title="A human has edited this norm">edited</span>}
                        {needsReview && <span className="badge-high" title="New data has drifted from the edited norm">review · new data</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                        {expanded === c.id ? 'Close' : 'Edit'}
                      </button>{' '}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openMembers(c)} title="Choose which athletes shape this norm">
                        {membersFor === c.id ? 'Hide members' : 'Members'}
                      </button>{' '}
                      {isAdmin && (c.status === 'pending'
                        ? <button type="button" className="btn btn-primary btn-sm" onClick={() => approve(c, 'approved')} disabled={busy}>Set live</button>
                        : <button type="button" className="btn btn-outline btn-sm" onClick={() => approve(c, 'pending')} disabled={busy}>Hold</button>)}
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg)' }}>
                        <div style={{ padding: '8px 4px' }}>
                          {needsReview && (
                            <div className="alert alert-info" style={{ marginBottom: 10 }}>
                              <strong>New data has moved this cohort.</strong> Your edited norm is still live. Review the drift, then keep your edit or reset to the computed norm:
                              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.82rem' }}>
                                {c.review!.items.map((it) => {
                                  const label = COMPONENTS.find(([k]) => k === it.component)?.[1] ?? it.component;
                                  return (
                                    <li key={it.component}>
                                      {label}: your norm <strong>{it.manual}</strong> → new data <strong>{it.computed}</strong>{' '}
                                      <span style={{ color: it.delta > 0 ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                                        ({it.delta > 0 ? '+' : ''}{it.delta})
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                            Component means (the norm each athlete is z-scored against) — pre-filled from the computed average; edit to override. SD stays computed.
                          </div>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            {COMPONENTS.map(([key, label]) => {
                              const base = c.overrides?.[key] ?? c.stats[key];
                              if (!base) return null;
                              const editKey = `${c.id}.${key}`;
                              const computed = c.stats[key];
                              const isEdited = Boolean(c.overrides?.[key]);
                              return (
                                <div key={key} style={{ minWidth: 130 }}>
                                  <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{label} (μ)</label>
                                  <input type="number" step="0.1"
                                    value={editKey in edits ? edits[editKey] : String(base.mean)}
                                    onChange={(e) => setEdits((p) => ({ ...p, [editKey]: e.target.value }))} />
                                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                                    σ {base.sd}{isEdited && computed ? ` · computed μ ${computed.mean}` : ''}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-gold btn-sm" onClick={() => saveOverrides(c)} disabled={busy}>Save edited norm</button>
                            {edited && <button type="button" className="btn btn-outline btn-sm" onClick={() => resetOverrides(c)} disabled={busy}>Reset to computed</button>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {membersFor === c.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg)' }}>
                        <div style={{ padding: '8px 4px' }}>
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                            Athletes in this cohort. Untick to keep one out of the norm, or mark them injured — either excludes them from the calculation (they&apos;re still scored against it). <strong>Recompute to apply.</strong>
                          </div>
                          {membersBusy ? (
                            <p className="text-muted">Loading members…</p>
                          ) : members.length === 0 ? (
                            <div className="empty-state">No screened athletes in this cohort.</div>
                          ) : (
                            <div className="table-wrap">
                              <table>
                                <thead><tr>
                                  <th style={{ width: 36, textAlign: 'center' }} title="Include in the norm calculation">In</th>
                                  <th>Athlete</th>
                                  <th>Total</th><th>ROM</th><th>Stability</th>
                                  <th style={{ textAlign: 'center' }}>Sym</th>
                                  <th style={{ textAlign: 'center' }}>Band</th>
                                  <th>Status</th>
                                  <th style={{ textAlign: 'center' }}>Injured</th>
                                </tr></thead>
                                <tbody>
                                  {members.map((m) => (
                                    <tr key={m.athleteId} style={{ opacity: m.eligible ? 1 : 0.6 }}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={!m.normExcluded} onChange={() => toggleExclude(m)} aria-label={`Include ${m.name} in the norm`} />
                                      </td>
                                      <td><strong>{m.name}</strong>{' '}<span className="text-muted" style={{ fontSize: '0.76rem' }}>{m.program ?? ''}{m.gender ? ` · ${m.gender}` : ''}</span></td>
                                      <td><ScoreBar v={m.totalScore} /></td>
                                      <td><ScoreBar v={m.rom} /></td>
                                      <td><ScoreBar v={m.stability} /></td>
                                      <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{m.symmetry ?? '—'}</td>
                                      <td style={{ textAlign: 'center' }}>
                                        <span title={m.overallBand ?? 'unscored'} style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: m.overallBand ? BAND_DOT[m.overallBand] : 'var(--border)' }} />
                                      </td>
                                      <td>
                                        {m.eligible
                                          ? <span className="badge-low">In norm</span>
                                          : <span className="badge-moderate">{m.reason ? (REASON_LABEL[m.reason] ?? m.reason) : 'Excluded'}</span>}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={m.isInjured} onChange={() => toggleInjury(m)} aria-label={`Mark ${m.name} injured`} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Saved norm versions (B1) — name the current norm set, restore it later. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Saved norm versions</h2>
          <span className="card-sub">Snapshot the current norms under a name, then restore that exact set later if imports or edits move them.{!isAdmin && ' Restoring/deleting is admin-only.'}</span>
        </div></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="Name this norm set (e.g. Pre-season 2026)" style={{ minWidth: 260 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={saveVersion} disabled={busy || !versionName.trim()}>Save current as version</button>
        </div>
        {versions.length === 0 ? (
          <div className="empty-state">No saved versions yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Saved</th><th style={{ textAlign: 'center' }}>Cohorts</th><th></th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.label}</strong>{v.note && <div className="text-muted" style={{ fontSize: '0.78rem' }}>{v.note}</div>}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(v.createdAt).toLocaleDateString()}{v.createdBy ? ` · ${v.createdBy}` : ''}</td>
                    <td style={{ textAlign: 'center' }}>{v.cohorts}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => renameVersion(v)} disabled={busy}>Rename</button>{' '}
                      {isAdmin && (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => restoreVersion(v)} disabled={busy}>Restore</button>{' '}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => deleteVersion(v)} disabled={busy}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
