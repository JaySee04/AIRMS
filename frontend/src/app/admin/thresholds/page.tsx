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
import { useNormChangeNotice } from '@/components/admin/NormChangeNotice';
import { api } from '@/lib/api';
import { tierMeta } from '@/lib/holomotionTiers';
import { getSession } from '@/lib/auth';
import { BAND_COLOR } from '@/lib/bands';

interface Stat { mean: number; sd: number; n?: number; }
interface Cohort {
  id: number;
  sport: string;
  programme: string | null;
  gender: string | null;
  discipline: string | null;
  tier: 'spgd' | 'spg' | 'sg' | 's' | 'all';
  n: number;
  stats: Record<string, Stat>;
  overrides: Record<string, Stat> | null;
  status: 'pending' | 'approved';
  approvedBy?: string | null;
  review?: { needed: boolean; items: Array<{ component: string; manual: number; computed: number; delta: number }> };
  addedSincePin?: boolean;
  freshN?: number | null;
  freshAt?: string | null;
  // How far the HELD norm has drifted from what today's data would produce.
  // Only populated while a version is pinned — otherwise `stats` IS current.
  drift?: {
    held: boolean;
    items: Array<{ component: string; inForce: number; now: number; delta: number }>;
    worst: { component: string; inForce: number; now: number; delta: number } | null;
    nDelta: number | null;
  };
}
interface SettingsResp { settings: Record<string, number | boolean | string>; defaults: Record<string, number | boolean | string>; }

interface Member {
  athleteId: string; name: string; program: string | null; gender: string | null;
  isInjured: boolean; normExcluded: boolean;
  totalScore: number | null; rom: number | null; stability: number | null; symmetry: number | null;
  overallBand: 'green' | 'amber' | 'red' | null; overallIndicator: number | null;
  eligible: boolean; reason: string | null;
  // Attribution — who acted on this athlete, so a norm exclusion can be traced
  // back to a person rather than just appearing.
  injuryBy?: string | null; injuryAt?: string | null; injuryNote?: string | null;
  importedBy?: string | null;
}

const BAND_DOT: Record<string, string> = BAND_COLOR;
const REASON_LABEL: Record<string, string> = {
  injured: 'Injured', excluded: 'Excluded (manual)', 'below-total': 'Below Total', 'below-rom': 'Below ROM', 'below-stability': 'Below Stability',
};

// A 0–100 score as a ring: the number sits inside, the arc length is the score,
// and the colour is the HoloMotion tier the score falls in. Boundaries and
// colours come from lib/holomotionTiers.ts — the same source the dashboards and
// the PDF read — so a 74 is the same amber here as everywhere else.
function ScoreRing({ v, label }: { v: number | null; label: string }) {
  const has = v !== null && v !== undefined;
  const val = has ? Math.max(0, Math.min(100, v as number)) : 0;
  const meta = has ? tierMeta(v as number) : null;
  const R = 17;
  const CIRC = 2 * Math.PI * R;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 46 }}
      title={has ? `${label}: ${v} / 100 — ${meta?.label}` : `${label}: no reading`}
    >
      <svg width="42" height="42" viewBox="0 0 42 42" role="img"
        aria-label={`${label} ${has ? `${v} of 100, ${meta?.label}` : 'no reading'}`}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
        {has && (
          <circle
            cx="21" cy="21" r={R} fill="none"
            stroke={meta?.color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - val / 100)}
            transform="rotate(-90 21 21)"
          />
        )}
        <text x="21" y="25.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">
          {has ? v : '–'}
        </text>
      </svg>
      <span className="text-muted" style={{ fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
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
  spgd: 'Sport + Programme + Gender + Discipline', spg: 'Sport + Programme + Gender', sg: 'Sport + Gender', s: 'Sport', all: 'All athletes',
};

function cohortLabel(c: Cohort): string {
  if (c.tier === 'all') return 'All athletes';
  return [c.sport, c.programme, c.gender, c.discipline].filter(Boolean).join(' · ');
}

interface Version { id: number; label: string; note: string | null; createdBy: string | null; createdAt: string; cohorts: number; pinned: boolean; }
/** The saved version currently IN FORCE. While set, imports do not move the norms. */
interface Pin { id: number; label: string; createdBy: string | null; createdAt: string; active: boolean }
interface CohortsResp { pin: Pin | null; cohorts: Cohort[] }
interface VersionsResp { pinnedId: number | null; versions: Version[] }

export default function CohortThresholdsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // `${id}.${comp}` -> mean
  // Membership panel (B3/B4/B5): which cohort's members are open, and their rows.
  const [membersFor, setMembersFor] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersBusy, setMembersBusy] = useState(false);
  const { guard, notice } = useNormChangeNotice();
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
        api.get<CohortsResp>('/cohorts'),
        api.get<SettingsResp>('/cohorts/settings/all'),
        api.get<VersionsResp>('/cohorts/versions'),
      ]);
      setCohorts(c.cohorts);
      setPin(c.pin);
      setSettings(s);
      setVersions(v.versions);
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
  // Both of these rebuild the norm server-side, so BOTH the member rows and the
  // cohort rows have to be re-read. Refreshing only the members was the reason
  // the change looked like it had not happened: n, the norm rings and the band
  // dots all still showed the pre-change numbers until a manual reload.
  async function applyExclude(m: Member) {
    if (membersFor == null) return;
    setError(null);
    try {
      await api.patch(`/cohorts/members/${m.athleteId}`, { normExcluded: !m.normExcluded });
      await Promise.all([refreshMembers(membersFor), load()]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }
  async function applyInjury(m: Member) {
    if (membersFor == null) return;
    setError(null);
    try {
      await api.patch(`/athletes/${m.athleteId}/injury`, { isInjured: !m.isInjured });
      await Promise.all([refreshMembers(membersFor), load()]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }
  // Both of these rebuild the norm server-side, so the first one in a browser
  // says so before it happens.
  const toggleExclude = (m: Member) => guard(() => { void applyExclude(m); });
  const toggleInjury = (m: Member) => guard(() => { void applyInjury(m); });

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
  async function pinVersion(v: Version) {
    if (!window.confirm(
      `Pin “${v.label}” as the norms in force?\n\n`
      + `Its values are installed over the current norms for ${v.cohorts} cohorts and every athlete is re-scored. `
      + 'From then on, imports will NOT change the norms — AIRMS keeps computing what the data would say and shows you the drift, '
      + 'so you can release the pin when you choose.',
    )) return;
    setBusy(true); setError(null); setMsg(null);
    try { await api.post(`/cohorts/versions/${v.id}/pin`, {}); setMsg(`“${v.label}” is now the norm set in force.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Pin failed'); } finally { setBusy(false); }
  }
  async function unpinVersion() {
    if (!window.confirm(
      'Release the pin?\n\nThe norms will be recomputed from the current data straight away and every athlete re-scored, '
      + 'so scores may move.',
    )) return;
    setBusy(true); setError(null); setMsg(null);
    try { await api.post('/cohorts/versions/unpin', {}); setMsg('Pin released — the norms follow the data again.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Release failed'); } finally { setBusy(false); }
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
      {notice}
      {/* A pin changes what every number on this page MEANS — they are held,
          not current — so it is announced before any of them, not in the
          versions card at the bottom. */}
      {pin && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--brand-gold)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 380px', minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                📌 Norms are pinned to “{pin.label}”
              </div>
              <div className="text-muted" style={{ fontSize: 'var(--fs-md)', lineHeight: 1.5 }}>
                Every athlete is scored against this saved set, and <strong>imports will not change it</strong>.
                AIRMS keeps computing what the current data would produce and shows the difference per cohort
                below, so you can see how far the held norm has drifted before releasing it.
                {pin.createdBy && <> Pinned set saved by {pin.createdBy}.</>}
              </div>
            </div>
            {isAdmin && (
              <button type="button" className="btn btn-outline btn-sm" onClick={unpinVersion} disabled={busy}>
                Release pin
              </button>
            )}
          </div>
        </div>
      )}
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
                    <td>
                      {/* Members opens from a disclosure at the START of the
                          row, next to the cohort it belongs to, rather than a
                          button at the far right — the control now sits with
                          the thing it expands. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => openMembers(c)}
                          aria-expanded={membersFor === c.id}
                          aria-label={membersFor === c.id ? `Hide the athletes in ${cohortLabel(c)}` : `Show the athletes shaping ${cohortLabel(c)}`}
                          title="Which athletes shape this norm"
                          style={{
                            border: '1px solid var(--border)',
                            background: membersFor === c.id ? 'var(--brand-navy)' : 'transparent',
                            color: membersFor === c.id ? '#fff' : 'var(--text-muted)',
                            borderRadius: 6, width: 24, height: 24, flexShrink: 0, padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: membersFor === c.id ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
                            <polyline points="9,6 15,12 9,18" />
                          </svg>
                        </button>
                        <strong>{cohortLabel(c)}</strong>
                      </div>
                    </td>
                    <td className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{TIER_LABEL[c.tier]}</td>
                    <td style={{ textAlign: 'center', color: c.n >= Number(set.min_cohort_n ?? 5) ? 'inherit' : 'var(--risk-high)' }}>{c.n}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.n < Number(set.min_cohort_n ?? 5)
                          ? <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>insufficient data</span>
                          : <span className={live ? 'badge-low' : 'badge-moderate'}>{live ? 'Live' : 'Held'}</span>}
                        {edited && <span className="badge-moderate" title="A human has edited this norm">edited</span>}
                        {needsReview && <span className="badge-high" title="New data has drifted from the edited norm">review · new data</span>}
                        {/* Drift against the PIN — the honesty half of holding a
                            norm. Without it a pin is just a frozen number with no
                            way to tell whether it has gone stale. */}
                        {c.addedSincePin && (
                          <span className="badge-moderate" title="This cohort did not exist when the pin was taken, so the pinned set does not cover it — its norm is computed from current data">
                            not in pin
                          </span>
                        )}
                        {c.drift?.worst && (
                          <span
                            className="badge-high"
                            title={`Held at ${c.drift.worst.inForce}; current data says ${c.drift.worst.now}. `
                              + c.drift.items.map((i) => `${i.component} ${i.delta > 0 ? '+' : ''}${i.delta}`).join(' · ')}
                          >
                            drifted {c.drift.worst.delta > 0 ? '+' : ''}{c.drift.worst.delta.toFixed(1)}
                          </span>
                        )}
                        {typeof c.drift?.nDelta === 'number' && c.drift.nDelta !== 0 && (
                          <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}
                            title={`Pinned when this cohort had ${c.n} athletes; it now has ${c.freshN}`}>
                            n {c.n} → {c.freshN}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                        {expanded === c.id ? 'Close' : 'Edit'}
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
                              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'var(--fs-sm)' }}>
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
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            {COMPONENTS.map(([key, label]) => {
                              const base = c.overrides?.[key] ?? c.stats[key];
                              if (!base) return null;
                              const editKey = `${c.id}.${key}`;
                              const computed = c.stats[key];
                              const isEdited = Boolean(c.overrides?.[key]);
                              return (
                                <div key={key} style={{ minWidth: 130 }}>
                                  <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{label} (μ)</label>
                                  <input type="number" step="0.1"
                                    value={editKey in edits ? edits[editKey] : String(base.mean)}
                                    onChange={(e) => setEdits((p) => ({ ...p, [editKey]: e.target.value }))} />
                                  <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
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
                          <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 8 }}>
                            Athletes in this cohort. Untick to keep one out of the norm, or mark them injured — either excludes them from the calculation (they&apos;re still scored against it). <strong>The norm rebuilds immediately.</strong>
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
                                  <th style={{ textAlign: 'center' }} colSpan={3} title="0-100, higher is better. Ring colour is the HoloMotion tier.">Scores</th>
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
                                      <td>
                                        <strong>{m.name}</strong>{' '}
                                        <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>{m.program ?? ''}{m.gender ? ` · ${m.gender}` : ''}</span>
                                        {/* Whose judgement took this athlete out of the
                                            norm, and who put their reading in. */}
                                        {m.isInjured && m.injuryBy && (
                                          <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                                            injured by {m.injuryBy}
                                            {m.injuryAt ? ` · ${new Date(m.injuryAt).toLocaleDateString()}` : ''}
                                            {m.injuryNote ? ` · ${m.injuryNote}` : ''}
                                          </div>
                                        )}
                                        {m.importedBy && (
                                          <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                                            screened by {m.importedBy}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center' }}><ScoreRing v={m.totalScore} label="Total" /></td>
                                      <td style={{ textAlign: 'center' }}><ScoreRing v={m.rom} label="ROM" /></td>
                                      <td style={{ textAlign: 'center' }}><ScoreRing v={m.stability} label="Stab" /></td>
                                      <td style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>{m.symmetry ?? '—'}</td>
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
          <span className="card-sub">Snapshot the current norms under a name. <strong>Restore</strong> puts a set back once; <strong>Pin</strong> makes it the set in force, so imports stop moving the norms until you release it.{!isAdmin && ' Pinning, restoring and deleting are admin-only.'}</span>
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
              <thead><tr><th>Name</th><th>Saved</th><th style={{ textAlign: 'center' }}>Cohorts</th><th style={{ textAlign: 'center' }}>In force</th><th></th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.label}</strong>{v.note && <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{v.note}</div>}</td>
                    <td className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{new Date(v.createdAt).toLocaleDateString()}{v.createdBy ? ` · ${v.createdBy}` : ''}</td>
                    <td style={{ textAlign: 'center' }}>{v.cohorts}</td>
                    <td style={{ textAlign: 'center' }}>
                      {v.pinned
                        ? <span className="badge-low" title="These norms are in force; imports will not change them">📌 Pinned</span>
                        : <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => renameVersion(v)} disabled={busy}>Rename</button>{' '}
                      {isAdmin && (
                        <>
                          {v.pinned
                            ? <button type="button" className="btn btn-outline btn-sm" onClick={unpinVersion} disabled={busy}>Release</button>
                            : <button type="button" className="btn btn-primary btn-sm" onClick={() => pinVersion(v)} disabled={busy}>Pin</button>}{' '}
                          {/* Restoring while something else is pinned is refused by the
                              API, so it is hidden rather than offered and then rejected. */}
                          {!pin && <><button type="button" className="btn btn-outline btn-sm" onClick={() => restoreVersion(v)} disabled={busy}>Restore</button>{' '}</>}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => deleteVersion(v)} disabled={busy || v.pinned} title={v.pinned ? 'Release the pin before deleting this version' : undefined}>Delete</button>
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
