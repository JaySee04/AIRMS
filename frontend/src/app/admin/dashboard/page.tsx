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
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CohortFilters, { useCohortFilters } from '@/components/admin/CohortFilters';
import TrendStrip from '@/components/admin/TrendStrip';
import DistributionBar from '@/components/admin/DistributionBar';
import { DotPlot, Heatmap, Histogram, RankedBars, Ring, Scatter } from '@/components/charts/Charts';
import { TIER_COLOR, TIER_LABEL, TIER_ORDER, TIER_RANGE, tierOf } from '@/lib/holomotionTiers';
import { BAND_COLOR, bandSegments } from '@/lib/bands';
import { api } from '@/lib/api';

// The licensed anatomical figure, at COHORT level. Heavy + client-only, so it
// is split out exactly as the per-athlete dashboards do.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 320 }} /> });

interface ScreeningCohort {
  totalAthletes: number;
  screened: number;
  unscreened: number;
  averages: Record<string, number | null>;
  indicators: Array<{ key: string; label: string; ok: number; watch: number; high: number }>;
  topMyodynamia: Array<{ muscle: string; count: number }>;
  topTension: Array<{ muscle: string; count: number }>;
  bandDistribution: { green: number; amber: number; red: number; none: number };
  // The 25-cell subitem table, aggregated. See backend/utils/subitemAggregate.js.
  subitems: {
    n: number;
    matrix: Array<{ key: string; label: string; cells: Array<{ key: string; label: string; value: number | null; n: number }> }>;
    asymmetry: Array<{
      key: string; label: string;
      metrics: Array<{
        metric: 'rom' | 'stab'; n: number;
        meanGap: number | null; meanSigned: number | null; weakerSide: 'left' | 'right' | null;
        notable: number; meanLeft: number | null; meanRight: number | null;
      }>;
    }>;
    worstCell: { region: string; label: string; value: number } | null;
    worstAsymmetry: { region: string; metric: string; meanGap: number; notable: number } | null;
    notableGap: number;
  };
  points: Array<{
    athleteId: string; name: string; sport: string | null;
    totalScore: number | null; exerciseRisks: number | null; indicator: number | null;
    band: 'green' | 'amber' | 'red' | null;
  }>;
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

// Status colours (theme-aware). Reserved for STATE — a clinical band. Never a
// series hue: `gold` and `blue` used to be pressed into service for the average
// physical-quality bars and the weak/tight muscle split, so a healthy 76/100 was
// drawn in the same amber the app uses for "needs attention". Quantities now use
// the --series-* tokens.
const C = BAND_COLOR;
const S = { s1: 'var(--series-1)', s2: 'var(--series-2)', s3: 'var(--series-3)' };

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
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 8 }}>{title}</div>
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
              <div style={{ width: 132, fontSize: 'var(--fs-sm)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>
                {r.label} <span className="text-muted">({r.n})</span>
              </div>
              <div style={{ flex: 1, display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}
                title={`${r.label}: ${r.ok} Low · ${r.watch} Watch · ${r.high} Elevated`}>
                {segs.map((x, i) => (
                  <div key={x.label} style={{ width: `${(x.value / r.n) * 100}%`, background: x.color, borderRight: i < segs.length - 1 ? '2px solid var(--bg)' : undefined }} />
                ))}
              </div>
              <div style={{ width: 74, textAlign: 'right', fontSize: 'var(--fs-sm)', flexShrink: 0 }}>
                {r.high > 0
                  ? <span style={{ color: C.red, fontWeight: 700 }}>{r.high} ({share}%)</span>
                  : <span className="text-muted">0 elev.</span>}
              </div>
              <div style={{ width: 42, textAlign: 'right', fontWeight: 700, fontSize: 'var(--fs-sm)', flexShrink: 0 }}
                title={`Average reading — lower is better (worst here ${maxAvg})`}>{r.avg ?? '—'}</div>
            </div>
          );
        })}
      </div>
      {note && <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 8 }}>{note}</div>}
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

  // Two separate lists, each already ordered by the backend. They used to be
  // merged into one list of 8 and sorted together, which meant a cohort with
  // heavy tension could push every weakness finding off the panel entirely.
  const weakMuscles = useMemo(() => (cohort?.topMyodynamia ?? []).slice(0, 7), [cohort]);
  const tightMuscles = useMemo(() => (cohort?.topTension ?? []).slice(0, 7), [cohort]);

  // The cohort's mean subitem table, reshaped into the per-athlete structure the
  // body map already reads. Feeding the squad average into the SAME figure the
  // clinician sees for one athlete is the point: the admin dashboard had no
  // anatomical view at all, while the whole instrument speaks in body regions.
  const squadSubitems = useMemo(() => {
    if (!cohort?.subitems?.matrix?.length) return null;
    const out: Record<string, Record<string, number | null>> = {};
    for (const r of cohort.subitems.matrix) {
      out[r.key] = Object.fromEntries(r.cells.map((c) => [c.key, c.value]));
    }
    return out as never;
  }, [cohort]);

  // Muscle flags, aggregated: a muscle appears on the squad figure if anyone in
  // the cohort was flagged for it. Side 'B' because a squad has no single side —
  // the per-muscle counts live in the two ranked lists further down.
  const squadFlags = useMemo(() => ({
    myodynamia: (cohort?.topMyodynamia ?? []).map((m) => ({ muscle: m.muscle, side: 'B' as const })),
    tension: (cohort?.topTension ?? []).map((m) => ({ muscle: m.muscle, side: 'B' as const })),
  }), [cohort]);

  const scatterPoints = useMemo(() => (cohort?.points ?? [])
    .filter((p) => p.totalScore !== null && p.exerciseRisks !== null)
    .map((p) => ({
      key: p.athleteId,
      label: p.name,
      x: p.totalScore as number,
      y: p.exerciseRisks as number,
      color: p.band ? C[p.band] : 'var(--text-muted)',
      hint: `${p.name}${p.sport ? ` · ${p.sport}` : ''} — Total Score ${p.totalScore}, Exercise Risks ${p.exerciseRisks}`,
    })), [cohort]);

  const indicatorValues = useMemo(
    () => (cohort?.points ?? []).map((p) => p.indicator).filter((v): v is number => v !== null),
    [cohort],
  );

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
                  {focus.high}<span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-muted)', fontWeight: 500 }}> / {focus.n}</span>
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
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, fontSize: 'var(--fs-sm)' }}>
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
                        <td className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{w.athleteId}</td>
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

      {/* ── Population verdict ───────────────────────────────────────────────
          Coverage ring + band split + the two headline averages in ONE panel.
          Previously four flat stat tiles and a separate distribution card, which
          gave the page no dominant element — the reader's eye had nothing to land
          on and every panel competed at the same weight. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Where the squad stands</h2>
          <span className="card-sub">Coverage, band split and headline averages for the current filters</span>
        </div></div>
        {loading || !cohort ? <p className="text-muted">Loading…</p> : (
          <div className="verdict">
            <Ring
              value={cohort.screened}
              total={cohort.totalAthletes}
              label="Screened"
              sublabel={cohort.unscreened > 0 ? `${cohort.unscreened} awaiting a report` : 'Everyone has a report'}
            />
            <div className="verdict-main">
              {/* Segments from lib/bands.ts — this list was hand-written and
                  called the red band "Immediate" while the risk hero called it
                  "Immediate assessment". */}
              {bd && <DistributionBar segments={bandSegments(bd, { short: true })} />}
              <div className="verdict-stats">
                <div>
                  <span className="verdict-stat-label">Avg Total Score</span>
                  <span className="verdict-stat-value">{a?.overallActivityScore ?? '—'}</span>
                  <span className="verdict-stat-hint">of 100 · higher is better</span>
                </div>
                <div>
                  <span className="verdict-stat-label">Avg Exercise Risks</span>
                  <span className="verdict-stat-value">{a?.injuryRiskIndex ?? '—'}</span>
                  <span className="verdict-stat-hint">lower is better</span>
                </div>
                <div>
                  <span className="verdict-stat-label">Elevated readings</span>
                  <span className="verdict-stat-value" style={{ color: elevatedTotal > 0 ? C.red : undefined }}>{elevatedTotal}</span>
                  <span className="verdict-stat-hint">above 25, across the cohort</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 1 — physical quality (zoomed) + indicator counts (shared axis) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Physical Quality — which is weakest?</h2>
            <span className="card-sub">Cohort averages, 0–100 and higher is better</span>
          </div></div>
          {a ? (
            /* A ZOOMED axis, because these four numbers cluster inside a few
               points of each other and on a 0–100 track they rendered as four
               identical bars — hiding the only thing the panel is for. The dot
               plot states its own zoom so the exaggeration is declared. */
            <DotPlot
              rows={[
                { label: 'Total', value: a.overallActivityScore ?? null },
                { label: 'ROM', value: a.mobility ?? null },
                { label: 'Stability', value: a.stability ?? null },
                { label: 'Symmetry', value: a.symmetry ?? null },
              ]}
              min={0}
              max={100}
            />
          ) : <p className="text-muted">Loading…</p>}
        </div>

        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Where the risk sits</h2>
            <span className="card-sub">Athletes at Watch or Elevated per indicator, worst first</span>
          </div></div>
          {cohort ? (
            <>
              {/* Counts on ONE shared axis, not each row normalised to its own
                  100% — that made rows impossible to compare, so "Ankle 13" vs
                  "Neck 6" was readable only from the text at the end. */}
              <RankedBars
                rows={[...cohort.indicators]
                  .sort((x, y) => (y.high - x.high) || (y.watch - x.watch))
                  .map((r) => ({
                    label: r.label,
                    segments: [
                      { label: 'Elevated', value: r.high, color: C.red },
                      { label: 'Watch', value: r.watch, color: C.amber },
                    ],
                    note: r.high > 0
                      ? <><strong style={{ color: C.red }}>{r.high}</strong> <span className="text-muted">elev · {r.watch} watch</span></>
                      : <span className="text-muted">{r.watch} watch</span>,
                  }))}
              />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 'var(--fs-sm)' }}>
                {([['Elevated >25', C.red], ['Watch 16–25', C.amber]] as const).map(([l, c]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{l}</span>
                ))}
                <span className="text-muted">Athletes at Low are not drawn — the bar is the problem, not the population.</span>
              </div>
            </>
          ) : <p className="text-muted">Loading…</p>}
        </div>
      </div>

      {/* Change over time moved to /admin/activity, which owns that question:
          the "Screening Trend" card that used to sit here compared each
          athlete's latest two screenings, which Between Successive Tests now
          does across ALL their consecutive pairs. Two near-identical cards on
          two pages invites the reader to reconcile numbers that mean the same
          thing. */}
      {/* Two lists rather than one mixed list colour-coded weak-vs-tight. The
          old version used gold for weak and blue for tight, which reads as a
          severity scale (it is not — they are opposite findings), and interleaved
          them so neither could be scanned. Splitting them means the colour
          carries nothing and the heading carries everything. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Weak Muscles</h2>
            <span className="card-sub">Myodynamia deficiency · athletes flagged</span>
          </div></div>
          {weakMuscles.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No weakness flags on record for this cohort.</div>
          ) : (
            <RankedBars
              rows={weakMuscles.map((m) => ({
                label: m.muscle,
                segments: [{ label: 'athletes', value: m.count, color: S.s1 }],
              }))}
            />
          )}
        </div>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Tight Muscles</h2>
            <span className="card-sub">Muscle tension · athletes flagged</span>
          </div></div>
          {tightMuscles.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No tension flags on record for this cohort.</div>
          ) : (
            <RankedBars
              rows={tightMuscles.map((m) => ({
                label: m.muscle,
                segments: [{ label: 'athletes', value: m.count, color: S.s2 }],
              }))}
            />
          )}
        </div>
      </div>

      {/* ── What the report actually measures, at squad grain ─────────────────
          The 25-cell Physical Fitness Subitem table is the densest thing
          HoloMotion produces — Total Score is literally its mean — and until now
          the admin dashboard aggregated none of it. A matrix is the only shape
          that preserves both of its axes, and it is the report's own layout. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Movement Quality by Region</h2>
          <span className="card-sub">
            Cohort average for each cell of the HoloMotion subitem table · 0–100, higher is better
            {cohort?.subitems ? ` · ${cohort.subitems.n} athlete${cohort.subitems.n === 1 ? '' : 's'} with subitem scores` : ''}
          </span>
        </div></div>
        {!cohort ? <p className="text-muted">Loading…</p> : (
          <>
            <Heatmap
              rows={cohort.subitems.matrix}
              colorFor={(v) => TIER_COLOR[tierOf(v)]}
              legend={TIER_ORDER.map((t) => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: TIER_COLOR[t] }} />
                  {TIER_LABEL[t]} <span className="text-muted">{TIER_RANGE[t]}</span>
                </span>
              ))}
            />
            {cohort.subitems.worstCell && (
              <p className="chart-note">
                Weakest cell: <strong>{cohort.subitems.worstCell.region} · {cohort.subitems.worstCell.label}</strong> at{' '}
                {cohort.subitems.worstCell.value}. Bands are HoloMotion&apos;s own 60 / 75 / 85 boundaries — the same ones
                the gauges, threshold strips and body map use.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Left vs right ────────────────────────────────────────────────────
          The only bilateral data the report carries, and it was invisible: the
          body map paints a region by the WORSE of L/R, the cohort composite
          averages every gap into one number, and the subitem table prints L and R
          and leaves the subtraction to the reader.

          Counts, not mean gaps. The means are flat at 3–4 points across every
          region and carry almost nothing; the number of athletes with a real gap
          runs 0–9 and separates ROM from stability cleanly. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Left–Right Asymmetry</h2>
          <span className="card-sub">
            Athletes whose two sides differ by {cohort?.subitems?.notableGap ?? 10} points or more — one full
            HoloMotion band, so the two sides would not be described by the same word
          </span>
        </div></div>
        {!cohort ? <p className="text-muted">Loading…</p> : (() => {
          const rows = cohort.subitems.asymmetry
            .flatMap((r) => r.metrics.map((m) => ({ region: r.label, ...m })))
            .filter((m) => m.n > 0)
            .sort((a, b) => b.notable - a.notable || (b.meanGap ?? 0) - (a.meanGap ?? 0));
          if (!rows.length) {
            return <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>No bilateral subitem readings for this selection.</div>;
          }
          return (
            <>
              <RankedBars
                rows={rows.map((m) => ({
                  label: `${m.region} · ${m.metric === 'rom' ? 'ROM' : 'Stability'}`,
                  segments: [{ label: 'athletes', value: m.notable, color: S.s1 }],
                  note: (
                    <span title={`Cohort means — left ${m.meanLeft}, right ${m.meanRight}`}>
                      <strong>{m.notable}</strong>{' '}
                      <span className="text-muted">
                        of {m.n} · L {m.meanLeft} / R {m.meanRight}
                        {m.weakerSide ? ` · weaker ${m.weakerSide}` : ''}
                      </span>
                    </span>
                  ),
                }))}
              />
              <p className="chart-note">
                {cohort.subitems.worstAsymmetry && (
                  <>
                    Most asymmetric: <strong>{cohort.subitems.worstAsymmetry.region}{' '}
                    {cohort.subitems.worstAsymmetry.metric === 'rom' ? 'ROM' : 'Stability'}</strong>{' '}
                    (mean gap {cohort.subitems.worstAsymmetry.meanGap} points).{' '}
                  </>
                )}
                A weaker side is only named when the squad tips the same way on average — a mix of
                left- and right-dominant athletes produces a large gap with no shared side, which is a
                different finding and not a squad-wide weakness.
              </p>
            </>
          );
        })()}
      </div>


      {/* ── Squad body map ───────────────────────────────────────────────────
          The same licensed figure the clinician reads for one athlete, fed the
          cohort's mean subitem table. Nothing on this page was anatomical, which
          is odd for a product whose entire vocabulary is body regions. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Squad Body Map</h2>
          <span className="card-sub">
            The cohort average on the same figure used for an individual · switch between the muscles
            flagged anywhere in this squad and the region ROM/Stability picture
          </span>
        </div></div>
        {!cohort ? <p className="text-muted">Loading…</p> : (
          <>
            <BodyMap myodynamia={squadFlags.myodynamia} tension={squadFlags.tension} subitems={squadSubitems} />
            <p className="chart-note">
              Region shading is the cohort mean, banded on HoloMotion&apos;s own 60 / 75 / 85 boundaries.
              In Muscle Flags mode a muscle is lit if <em>anyone</em> in this cohort was flagged for it — the
              per-muscle counts are in the two lists above, since a squad has no single left or right.
            </p>
          </>
        )}
      </div>

      {/* ── Risk vs movement quality ─────────────────────────────────────────
          One dot per athlete. Every other panel here is an average, and an
          average cannot show the athlete who moves well and still scores risky —
          which is exactly the one a screening programme exists to catch. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Risk vs Movement Quality</h2>
          <span className="card-sub">
            One dot per athlete, coloured by risk band · quadrants split on this cohort&apos;s medians
          </span>
        </div></div>
        {!cohort ? <p className="text-muted">Loading…</p> : (
          <>
            <Scatter
              points={scatterPoints}
              xLabel="Total Score"
              yLabel="Exercise Risks"
              quadrants={[
                'High risk · poor mover',
                'High risk · good mover',
                'Low risk · good mover',
                'Low risk · poor mover',
              ]}
            />
            <p className="chart-note">
              Top-right is the reading to look for: an athlete whose movement quality is above the group
              and whose risk score is too — no single number surfaces them, because the two measure
              different halves of the report. Quadrant lines are cohort medians, so &ldquo;high&rdquo;
              means high <em>for this group</em> rather than against a fixed cut-off.
            </p>
          </>
        )}
      </div>

      {/* ── Distribution of the cohort indicator ─────────────────────────────
          A mean of 50 is produced equally by everyone sitting on 50 and by half
          the squad at 30 and half at 70. Different squads, different decisions. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Where the Squad Sits</h2>
          <span className="card-sub">
            Distribution of the cohort-normed indicator · 50 is this group&apos;s average by construction
          </span>
        </div></div>
        {!cohort ? <p className="text-muted">Loading…</p> : (
          <>
            <Histogram
              values={indicatorValues}
              min={0}
              max={100}
              binSize={5}
              valueLabel="indicator"
              markers={[{ at: 50, label: 'Cohort average (50)', color: 'var(--text-muted)' }]}
            />
            <p className="chart-note">
              The indicator is relative by construction, so the centre of this shape sits at 50 whatever
              the squad&apos;s absolute quality. What it shows is the SPREAD — a tight cluster means an even
              squad, a long left tail means a handful of athletes carrying the risk, and the averages on
              this page cannot tell those apart.
            </p>
          </>
        )}
      </div>

    </DashboardLayout>
  );
}
