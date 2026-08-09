'use client';

// Admin · Screening Analytics — the CURRENT STATE of the screened population:
// coverage, band distribution, average physical-quality scores, per-indicator
// risk spread and muscle hotspots. Every panel follows the cohort filters
// (sport / programme / gender / age), so "by sport / by gender / by age group"
// (Dr Thung) is the interaction.
//
// Change OVER TIME is deliberately not here — it lives on /admin/activity
// (Programme Activity). One page answers "what state is the squad in?", the
// other "are we screening enough, and is the population moving?". They were
// briefly one page and it read as two reports stapled together.
//
// The visuals are plain HTML/CSS (theme-aware CSS vars), not a chart library:
// 100%-stacked distribution bars replace the old pies, horizontal labeled bars
// replace the vertical bars, and every value is directly labelled so meaning is
// never colour-alone. Injury-log analytics were removed 2026-08-02 (HoloMotion
// scope); Chart.js was retired from this page in the 2026-08-04 viz upgrade.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CohortFilters, { useCohortFilters } from '@/components/admin/CohortFilters';
import TrendStrip from '@/components/admin/TrendStrip';
import DistributionBar from '@/components/admin/DistributionBar';
import { api } from '@/lib/api';

interface ScreeningCohort {
  totalAthletes: number;
  screened: number;
  unscreened: number;
  averages: Record<string, number | null>;
  indicators: Array<{ key: string; label: string; ok: number; watch: number; high: number }>;
  topMyodynamia: Array<{ muscle: string; count: number }>;
  topTension: Array<{ muscle: string; count: number }>;
  bandDistribution: { green: number; amber: number; red: number; none: number };
  trend: {
    comparable: number;
    improving: number; declining: number; steady: number;
    bandMoves: { better: number; worse: number };
    deltas: Array<{ key: string; label: string; higherBetter: boolean; avgDelta: number | null }>;
  };
  focus: FocusBreakdown | null;
}

// One indicator expressed across every slice — present only when a region
// focus is applied. See backend/src/utils/cohortFocus.js.
export interface FocusSlice { label: string; n: number; ok: number; watch: number; high: number; avg: number | null }
export interface FocusBreakdown {
  key: string; label: string;
  n: number; ok: number; watch: number; high: number; avg: number | null;
  baselineAvg: number | null; baselineHighShare: number | null;
  bySlice: { sport: FocusSlice[]; gender: FocusSlice[]; ageGroup: FocusSlice[]; programme: FocusSlice[] };
  worst: Array<{ athleteId: string; name: string; sport: string; gender: string; value: number; band: string }>;
}

// Status colours (theme-aware). Reserved for state — never reused as series hues.
const C = { green: 'var(--risk-low)', amber: 'var(--risk-moderate)', red: 'var(--risk-high)', gold: 'var(--brand-gold)', blue: 'var(--risk-undertrained)' };

// Horizontal labelled bars on a 0–max track. Replaces the vertical score bars.
function ScoreBars({ rows, max = 100 }: { rows: Array<{ label: string; value: number | null }>; max?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 84, fontSize: '0.85rem', flexShrink: 0 }}>{r.label}</div>
          <div style={{ flex: 1, height: 18, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }} title={r.value == null ? 'No data' : `${r.label}: ${r.value} / ${max}`}>
            <div style={{ width: `${Math.max(0, Math.min(100, ((r.value ?? 0) / max) * 100))}%`, height: '100%', background: C.gold, borderRadius: 5 }} />
          </div>
          <div style={{ width: 42, textAlign: 'right', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>{r.value == null ? '—' : r.value}</div>
        </div>
      ))}
    </div>
  );
}

// One 100%-stacked bar per exercise-risk indicator (Low / Watch / Elevated),
// sorted most-elevated first, with the elevated count called out on the right.
function IndicatorBars({ indicators }: { indicators: ScreeningCohort['indicators'] }) {
  const rows = [...indicators].sort((a, b) => (b.high - a.high) || (b.watch - a.watch));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
      {rows.map((r) => {
        const total = r.ok + r.watch + r.high || 1;
        const segs = [
          { label: 'Low', value: r.ok, color: C.green },
          { label: 'Watch', value: r.watch, color: C.amber },
          { label: 'Elevated', value: r.high, color: C.red },
        ].filter((s) => s.value > 0);
        return (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 118, fontSize: '0.82rem', flexShrink: 0 }}>{r.label}</div>
            <div style={{ flex: 1, display: 'flex', height: 18, borderRadius: 5, overflow: 'hidden', background: 'var(--border)' }}>
              {segs.map((s, i) => (
                <div key={s.label} title={`${r.label} — ${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRight: i < segs.length - 1 ? '2px solid var(--bg)' : undefined }} />
              ))}
            </div>
            <div style={{ width: 58, textAlign: 'right', fontSize: '0.8rem', flexShrink: 0 }}>
              {r.high > 0 ? <span style={{ color: C.red, fontWeight: 700 }}>{r.high} elev.</span> : <span className="text-muted">0 elev.</span>}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6, fontSize: '0.8rem' }}>
        {([['Low ≤15', C.green], ['Watch 16–25', C.amber], ['Elevated >25', C.red]] as const).map(([l, c]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{l}</span>
        ))}
      </div>
    </div>
  );
}

// Horizontal count bars for the most-flagged muscles (weak = gold, tight = blue;
// the label also carries weak/tight so it's never colour-alone).
function MuscleBars({ items }: { items: Array<{ label: string; count: number; weak: boolean }> }) {
  const max = Math.max(1, ...items.map((m) => m.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
      {items.map((m) => (
        <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 150, fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.label}>{m.label}</div>
          <div style={{ flex: 1, height: 16, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }} title={`${m.label}: ${m.count} athlete${m.count === 1 ? '' : 's'}`}>
            <div style={{ width: `${(m.count / max) * 100}%`, height: '100%', background: m.weak ? C.gold : C.blue, borderRadius: 4 }} />
          </div>
          <div style={{ width: 28, textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{m.count}</div>
        </div>
      ))}
    </div>
  );
}

// One slice dimension as rows: n, the Low/Watch/Elevated split, the share
// elevated and the average. Ordered worst-first by the backend, because the
// admin is looking for where a problem concentrates.
function SliceTable({ title, rows, note }: { title: string; rows: FocusSlice[]; note?: string }) {
  // A one-row breakdown is a tautology: it only happens when the population is
  // already filtered on this dimension (focus Knee within Female, and "By
  // gender" is just Female again). Hide it rather than show a single bar.
  if (rows.length < 2) return null;
  const maxAvg = Math.max(1, ...rows.map((r) => r.avg ?? 0));
  return (
    <div>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const share = r.n ? Math.round((r.high / r.n) * 100) : 0;
          const segs = [
            { label: 'Low', value: r.ok, color: C.green },
            { label: 'Watch', value: r.watch, color: C.amber },
            { label: 'Elevated', value: r.high, color: C.red },
          ].filter((x) => x.value > 0);
          return (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 132, fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>
                {r.label} <span className="text-muted">({r.n})</span>
              </div>
              <div style={{ flex: 1, display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}
                title={`${r.label}: ${r.ok} Low · ${r.watch} Watch · ${r.high} Elevated`}>
                {segs.map((x, i) => (
                  <div key={x.label} style={{ width: `${(x.value / r.n) * 100}%`, background: x.color, borderRight: i < segs.length - 1 ? '2px solid var(--bg)' : undefined }} />
                ))}
              </div>
              <div style={{ width: 74, textAlign: 'right', fontSize: '0.78rem', flexShrink: 0 }}>
                {r.high > 0
                  ? <span style={{ color: C.red, fontWeight: 700 }}>{r.high} ({share}%)</span>
                  : <span className="text-muted">0 elev.</span>}
              </div>
              <div style={{ width: 42, textAlign: 'right', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}
                title={`Average reading — lower is better (worst here ${maxAvg})`}>{r.avg ?? '—'}</div>
            </div>
          );
        })}
      </div>
      {note && <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 8 }}>{note}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const f = useCohortFilters();
  const [cohort, setCohort] = useState<ScreeningCohort | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [disciplines, setDisciplines] = useState<Array<{ sport: string; discipline: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sp, ds] = await Promise.all([
          api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]),
          api.get<Array<{ sport: string; discipline: string }>>('/athletes/meta/disciplines').catch(() => []),
        ]);
        if (!cancelled) { setSports(sp); setDisciplines(ds); }
      } catch { /* filter still usable without */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<ScreeningCohort>(`/athletes/analytics/screening${f.query ? `?${f.query}` : ''}`);
        if (!cancelled) { setCohort(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [f.query]);

  const elevatedTotal = useMemo(
    () => (cohort ? cohort.indicators.reduce((s, i) => s + i.high, 0) : 0),
    [cohort],
  );

  const muscles = useMemo(() => {
    if (!cohort) return [];
    return [
      ...cohort.topMyodynamia.map((m) => ({ label: `${m.muscle} (weak)`, count: m.count, weak: true })),
      ...cohort.topTension.map((m) => ({ label: `${m.muscle} (tight)`, count: m.count, weak: false })),
    ].sort((x, y) => y.count - x.count).slice(0, 8);
  }, [cohort]);

  const focus = cohort?.focus ?? null;
  const a = cohort?.averages;
  const bd = cohort?.bandDistribution;

  return (
    <DashboardLayout allowedRoles={['admin', 'executive']} title="Screening Analytics">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <CohortFilters
        f={f}
        sports={sports}
        disciplines={disciplines}
        showFocus
        note="Slices every panel below. Programme throughput over time lives on Programme Activity."
      />

      {/* Every other panel here is a snapshot; this is the only one that says
          which way things are moving. Kept to a summary — the full throughput,
          coverage and retest analysis stays on Programme Activity, which is a
          separate page on purpose. */}
      <div style={{ marginBottom: 20 }}>
        <TrendStrip query={f.query} />
      </div>

      {focus && (
        <>
          {/* Focused headline — the same cohort read through one indicator, set
              against the institute baseline so "worse than normal?" is
              answerable rather than left to intuition. */}
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--risk-high)' }}>
            <div className="card-header"><div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Focus &middot; {focus.label}</h2>
              <span className="card-sub">
                This cohort read through one indicator. No athlete is filtered out &mdash; that is what makes the
                comparisons below meaningful.
              </span>
            </div></div>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-tile-label">Elevated on {focus.label}</div>
                <div className="stat-tile-value" style={{ color: focus.high > 0 ? C.red : undefined }}>
                  {focus.high}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {focus.n}</span>
                </div>
                <div className="stat-tile-delta">{focus.n ? Math.round((focus.high / focus.n) * 100) : 0}% of this cohort</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Watch</div>
                <div className="stat-tile-value" style={{ color: focus.watch > 0 ? C.amber : undefined }}>{focus.watch}</div>
                <div className="stat-tile-delta">16&ndash;25 &middot; monitor</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Average reading</div>
                <div className="stat-tile-value">{focus.avg ?? '—'}</div>
                <div className="stat-tile-delta">lower is better</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">vs whole institute</div>
                {(() => {
                  const d = focus.avg !== null && focus.baselineAvg !== null
                    ? Number((focus.avg - focus.baselineAvg).toFixed(1)) : null;
                  if (d === null) return <div className="stat-tile-value">&mdash;</div>;
                  const worse = d > 0;
                  return (
                    <>
                      <div className="stat-tile-value" style={{ color: d === 0 ? undefined : worse ? C.red : C.green }}>
                        {d > 0 ? '+' : ''}{d}
                      </div>
                      <div className="stat-tile-delta">
                        institute avg {focus.baselineAvg} &middot; {d === 0 ? 'the same' : worse ? 'worse than normal' : 'better than normal'}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* The panel that answers "why do women have more knee" — one
              indicator, split every way the admin can think in. */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Where {focus.label} concentrates</h2>
              <span className="card-sub">
                Each group&apos;s Low / Watch / Elevated split on {focus.label}, ordered worst-first by the SHARE
                elevated &mdash; a squad of 4 with 3 elevated outranks one of 60 with 5, because policy follows
                proportion, not headcount.
              </span>
            </div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
              <SliceTable title="By sport" rows={focus.bySlice.sport} />
              <SliceTable title="By gender" rows={focus.bySlice.gender} />
              <SliceTable title="By age group" rows={focus.bySlice.ageGroup} />
              <SliceTable title="By programme" rows={focus.bySlice.programme} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, fontSize: '0.78rem' }}>
              {([['Low ≤15', C.green], ['Watch 16–25', C.amber], ['Elevated >25', C.red]] as const).map(([l, c]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{l}</span>
              ))}
              <span className="text-muted">Right-hand columns: elevated count (share of group) &middot; group average</span>
            </div>
          </div>

          {focus.worst.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Highest {focus.label} readings</h2>
                <span className="card-sub">Who to look at first &mdash; one step from where the problem is to who has it.</span>
              </div></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Athlete</th><th>IC number</th><th>Sport</th>
                      <th style={{ textAlign: 'right' }}>{focus.label}</th><th style={{ textAlign: 'right' }}>Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {focus.worst.map((w) => (
                      <tr key={w.athleteId}>
                        <td style={{ fontWeight: 600 }}>{w.name}</td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{w.athleteId}</td>
                        <td>{w.sport}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{w.value}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={w.band === 'high' ? 'badge-high' : w.band === 'watch' ? 'badge-moderate' : 'badge-low'}>
                            {w.band === 'high' ? 'Elevated' : w.band === 'watch' ? 'Watch' : 'Low'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* KPI tiles */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Athletes screened</div>
          <div className="stat-tile-value">{loading ? '…' : cohort?.screened ?? 0}<span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}> / {cohort?.totalAthletes ?? 0}</span></div>
          <div className="stat-tile-delta">{loading ? '' : `${cohort?.unscreened ?? 0} awaiting a report`}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Avg Total Score</div>
          <div className="stat-tile-value">{loading ? '…' : a?.overallActivityScore ?? '—'}</div>
          <div className="stat-tile-delta">Physical quality · / 100</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Avg Exercise Risks</div>
          <div className="stat-tile-value">{loading ? '…' : a?.injuryRiskIndex ?? '—'}</div>
          <div className="stat-tile-delta">Lower is better</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Elevated indicators</div>
          <div className="stat-tile-value">{loading ? '…' : elevatedTotal}</div>
          <div className="stat-tile-delta">Readings above 25, across the cohort</div>
        </div>
      </div>

      {/* Row 1 — band distribution + average scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Overall Risk Distribution</h2>
            <span className="card-sub">Screened athletes by their latest risk band</span>
          </div></div>
          {bd ? (
            <DistributionBar segments={[
              { label: 'Safe', value: bd.green, color: C.green },
              { label: 'Needs attention', value: bd.amber, color: C.amber },
              { label: 'Immediate', value: bd.red, color: C.red },
            ]} />
          ) : <p className="text-muted">Loading…</p>}
        </div>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Average Physical-Quality Scores</h2>
            <span className="card-sub">Cohort average · 0–100, higher is better</span>
          </div></div>
          {a ? (
            <ScoreBars rows={[
              { label: 'Total', value: a.overallActivityScore ?? null },
              { label: 'ROM', value: a.mobility ?? null },
              { label: 'Stability', value: a.stability ?? null },
              { label: 'Symmetry', value: a.symmetry ?? null },
            ]} />
          ) : <p className="text-muted">Loading…</p>}
        </div>
      </div>

      {/* Row 2 — risk indicators by band */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise-Risk Indicators by Band</h2>
          <span className="card-sub">Share of screened athletes in each band per indicator, most-elevated first</span>
        </div></div>
        {cohort ? <IndicatorBars indicators={cohort.indicators} /> : <p className="text-muted">Loading…</p>}
      </div>

      {/* Change over time moved to /admin/activity, which owns that question:
          the "Screening Trend" card that used to sit here compared each
          athlete's latest two screenings, which Between Successive Tests now
          does across ALL their consecutive pairs. Two near-identical cards on
          two pages invites the reader to reconcile numbers that mean the same
          thing. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Muscles</h2>
          <span className="card-sub">Athletes flagged per muscle (weak = myodynamia · tight = tension)</span>
        </div></div>
        {cohort && muscles.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>No muscle flags on record for this cohort.</div>
        ) : <MuscleBars items={muscles} />}
      </div>
    </DashboardLayout>
  );
}
