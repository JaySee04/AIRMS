'use client';

// Admin · Screening Analytics. A HoloMotion-only overview of the screened
// population — coverage, band distribution, average physical-quality scores,
// per-indicator risk spread, previous-vs-latest movement, and muscle hotspots.
// Every panel follows the cohort filters (sport / programme / gender / age), so
// "by sport / by gender / by age group" (Dr Thung) is the interaction.
//
// The visuals are plain HTML/CSS (theme-aware CSS vars), not a chart library:
// 100%-stacked distribution bars replace the old pies, horizontal labeled bars
// replace the vertical bars, and every value is directly labelled so meaning is
// never colour-alone. Injury-log analytics were removed 2026-08-02 (HoloMotion
// scope); Chart.js was retired from this page in the 2026-08-04 viz upgrade.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
}

// Screening-programme activity — the administrator's own performance view,
// as opposed to every other panel here, which is about the athletes.
type Grain = 'month' | 'quarter' | 'year';
interface PeriodDelta { delta: number | null; higherBetter: boolean; direction: string | null }
interface Period {
  key: string;
  label: string;
  tests: number;
  athletes: number;
  retestedWithin: number;
  bands: { green: number; amber: number; red: number; none: number };
  averages: Record<string, number | null>;
  deltas: Record<string, PeriodDelta> | null;
  direction: string | null;
}
interface PeriodsPayload {
  grain: Grain;
  periods: Period[];
  coverage: { rostered: number; tested: number; untested: number; tests: number };
  betweenTests: {
    athletesWithRetest: number;
    pairs: number;
    intervalDays: { median: number | null; min: number | null; max: number | null };
    improved: number; declined: number; steady: number;
    bandMoves: { better: number; worse: number; same: number };
    deltas: Array<{ key: string; label: string; higherBetter: boolean; avgDelta: number | null; direction: string | null }>;
  } | null;
}

const GRAINS: Array<{ key: Grain; label: string }> = [
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

const GENDERS = ['Male', 'Female'];
const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];
const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

// Status colours (theme-aware). Reserved for state — never reused as series hues.
const C = { green: 'var(--risk-low)', amber: 'var(--risk-moderate)', red: 'var(--risk-high)', neutral: 'var(--text-muted)', gold: 'var(--brand-gold)', blue: 'var(--risk-undertrained)' };

interface Seg { label: string; value: number; color: string }

// 100%-stacked horizontal distribution bar + a counted legend. Replaces a pie:
// proportion reads left-to-right and every slice carries its count and share.
function DistributionBar({ segments }: { segments: Seg[] }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
        {shown.map((s, i) => (
          <div key={s.label} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRight: i < shown.length - 1 ? '2px solid var(--bg)' : undefined }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.85rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span>{s.label}</span><strong>{s.value}</strong>
            <span className="text-muted">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

// Direction arrow + colour for a delta, respecting the score's orientation
// (exercise risks improve by going DOWN). Never colour-alone: the arrow
// glyph and the signed number both carry the meaning.
function Move({ delta, higherBetter, compact = false }: { delta: number | null; higherBetter: boolean; compact?: boolean }) {
  if (delta === null || delta === 0) {
    return <span className="text-muted" style={{ fontSize: compact ? '0.75rem' : '0.85rem' }}>→ 0</span>;
  }
  const better = higherBetter ? delta > 0 : delta < 0;
  return (
    <span style={{ color: better ? C.green : C.red, fontWeight: 700, fontSize: compact ? '0.75rem' : '0.85rem' }}>
      {better ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
    </span>
  );
}

// Throughput bar: tests per period, with the distinct-athlete share drawn
// inside it so a period of many retests is visibly different from a period of
// many new athletes.
function ThroughputBar({ tests, athletes, max }: { tests: number; athletes: number; max: number }) {
  const w = (tests / Math.max(1, max)) * 100;
  const inner = tests > 0 ? (athletes / tests) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 18, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}
      title={`${tests} test${tests === 1 ? '' : 's'} · ${athletes} distinct athlete${athletes === 1 ? '' : 's'}`}>
      <div style={{ width: `${w}%`, height: '100%', background: C.blue, borderRadius: 4, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${inner}%`, background: 'var(--brand-navy)', borderRadius: 4 }} />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [cohort, setCohort] = useState<ScreeningCohort | null>(null);
  const [periods, setPeriods] = useState<PeriodsPayload | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sport, setSport] = useState('');
  const [gender, setGender] = useState('');
  const [programme, setProgramme] = useState('');
  const [ageGroupIndex, setAgeGroupIndex] = useState(0);
  const [grain, setGrain] = useState<Grain>('quarter');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]);
        if (!cancelled) setSports(s);
      } catch { /* filter still usable without */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (sport) params.set('sport', sport);
        if (gender) params.set('gender', gender);
        if (programme) params.set('program', programme);
        const ag = AGE_GROUPS[ageGroupIndex];
        if (ag.min !== undefined) params.set('ageMin', String(ag.min));
        if (ag.max !== undefined) params.set('ageMax', String(ag.max));
        const qs = params.toString();
        // Both panels take the SAME cohort slicers, so the activity view and the
        // population view are always describing the same group of athletes.
        params.set('grain', grain);
        const [data, periodData] = await Promise.all([
          api.get<ScreeningCohort>(`/athletes/analytics/screening${qs ? `?${qs}` : ''}`),
          api.get<PeriodsPayload>(`/athletes/analytics/periods?${params.toString()}`),
        ]);
        if (!cancelled) { setCohort(data); setPeriods(periodData); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sport, gender, programme, ageGroupIndex, grain]);

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

  function reset() { setSport(''); setGender(''); setProgramme(''); setAgeGroupIndex(0); }

  const a = cohort?.averages;
  const bd = cohort?.bandDistribution;

  return (
    <DashboardLayout allowedRoles={['admin']} title="Screening Analytics">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Cohort filters — slice every panel by sport / gender / programme / age. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
            <label>Sport</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="">All sports</option>
              {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 120, marginBottom: 0 }}>
            <label>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">All</option>
              {GENDERS.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
            <label>Programme</label>
            <select value={programme} onChange={(e) => setProgramme(e.target.value)}>
              <option value="">All</option>
              {PROGRAMMES.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Age group</label>
            <select value={ageGroupIndex} onChange={(e) => setAgeGroupIndex(Number(e.target.value))}>
              {AGE_GROUPS.map((g, i) => (<option key={g.label} value={i}>{g.label}</option>))}
            </select>
          </div>
          <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={reset}>Reset</button>
        </div>
      </div>

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
      {/* Screening-programme activity. Unlike every other panel on this page,
          this one measures the PROGRAMME, not the athletes: throughput per
          period, and whether the population is moving. */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Programme Activity</h2>
            <span className="card-sub">
              How many athletes were tested per period, and which way population scores are moving.
              Period averages mix cohorts — narrow the filters above for a like-for-like comparison.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 3, borderRadius: 8, flexShrink: 0 }} role="group" aria-label="Period grain">
            {GRAINS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGrain(g.key)}
                aria-pressed={grain === g.key}
                style={{
                  border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600,
                  background: grain === g.key ? 'var(--brand-navy)' : 'transparent',
                  color: grain === g.key ? '#fff' : 'var(--text-muted)',
                }}
              >{g.label}</button>
            ))}
          </div>
        </div>

        {!periods ? <p className="text-muted">Loading…</p> : periods.periods.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            No screenings on record for this cohort, so there is no activity to report.
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-tile-label">Athletes tested</div>
                <div className="stat-tile-value">{periods.coverage.tested}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {periods.coverage.rostered}</span></div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Tests performed</div>
                <div className="stat-tile-value">{periods.coverage.tests}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Never tested</div>
                <div className="stat-tile-value" style={{ color: periods.coverage.untested > 0 ? C.amber : undefined }}>{periods.coverage.untested}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{GRAINS.find((g) => g.key === periods.grain)?.label} periods</div>
                <div className="stat-tile-value">{periods.periods.length}</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th style={{ width: '26%' }}>Tests / athletes</th>
                    <th style={{ textAlign: 'right' }}>Tests</th>
                    <th style={{ textAlign: 'right' }}>Athletes</th>
                    <th style={{ textAlign: 'right' }}>Avg indicator</th>
                    <th style={{ textAlign: 'right' }}>vs previous</th>
                    <th style={{ textAlign: 'right' }}>Avg risk</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxTests = Math.max(...periods.periods.map((p) => p.tests));
                    // Newest first: the period under discussion is the recent one.
                    return [...periods.periods].reverse().map((p) => (
                      <tr key={p.key}>
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</td>
                        <td><ThroughputBar tests={p.tests} athletes={p.athletes} max={maxTests} /></td>
                        <td style={{ textAlign: 'right' }}>{p.tests}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.athletes}
                          {p.retestedWithin > 0 && (
                            <span className="text-muted" style={{ fontSize: '0.72rem' }} title={`${p.retestedWithin} athlete(s) tested more than once in this period`}> ({p.retestedWithin} re)</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.averages.overallIndicator ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.deltas ? <Move delta={p.deltas.overallIndicator.delta} higherBetter /> : <span className="text-muted" style={{ fontSize: '0.8rem' }}>baseline</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.averages.exerciseRisks ?? '—'}
                          {p.deltas && (
                            <span style={{ marginLeft: 6 }}><Move delta={p.deltas.exerciseRisks.delta} higherBetter={false} compact /></span>
                          )}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: '0.78rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--brand-navy)' }} />distinct athletes
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: C.blue }} />repeat tests
              </span>
              <span className="text-muted">Avg indicator: 0–100, higher is better · Avg risk: lower is better</span>
            </div>
          </>
        )}
      </div>

      {/* Between-tests: within-athlete pairs, so each athlete is their own
          control. This is the only reading that can claim athletes improved
          rather than the population mix having changed. */}
      {periods?.betweenTests && periods.betweenTests.pairs > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Between Successive Tests</h2>
            <span className="card-sub">
              Every consecutive pair of tests for the same athlete ({periods.betweenTests.pairs} pair{periods.betweenTests.pairs === 1 ? '' : 's'} across {periods.betweenTests.athletesWithRetest} athlete{periods.betweenTests.athletesWithRetest === 1 ? '' : 's'}).
              Each athlete is their own comparison, so this measures change rather than a shift in who was tested.
            </span>
          </div></div>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="stat-tile-label">Improved</div>
              <div className="stat-tile-value" style={{ color: C.green }}>{periods.betweenTests.improved}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">Declined</div>
              <div className="stat-tile-value" style={{ color: C.red }}>{periods.betweenTests.declined}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">Unchanged</div>
              <div className="stat-tile-value">{periods.betweenTests.steady}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">Median retest gap</div>
              <div className="stat-tile-value">
                {periods.betweenTests.intervalDays.median === null ? '—' : `${periods.betweenTests.intervalDays.median}`}
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}> days</span>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <DistributionBar segments={[
              { label: 'Band improved', value: periods.betweenTests.bandMoves.better, color: C.green },
              { label: 'Band unchanged', value: periods.betweenTests.bandMoves.same, color: C.neutral },
              { label: 'Band worsened', value: periods.betweenTests.bandMoves.worse, color: C.red },
            ]} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>Average change per score, test to test</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {periods.betweenTests.deltas.map((d) => (
              <div key={d.key} style={{ textAlign: 'center', minWidth: 78 }}>
                <div className="stat-tile-label" style={{ fontSize: '0.68rem' }}>{d.label}</div>
                <div><Move delta={d.avgDelta} higherBetter={d.higherBetter} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise-Risk Indicators by Band</h2>
          <span className="card-sub">Share of screened athletes in each band per indicator, most-elevated first</span>
        </div></div>
        {cohort ? <IndicatorBars indicators={cohort.indicators} /> : <p className="text-muted">Loading…</p>}
      </div>

      {/* Row 3 — screening trend + muscle hotspots */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Trend</h2>
            <span className="card-sub">
              {cohort ? `${cohort.trend.comparable} athlete${cohort.trend.comparable === 1 ? '' : 's'} with a repeat report` : ''}
            </span>
          </div></div>
          {cohort && cohort.trend.comparable === 0 ? (
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>No athlete in this cohort has two screenings yet — import a newer HoloMotion report to compare.</div>
          ) : cohort ? (
            <>
              <DistributionBar segments={[
                { label: 'Improving', value: cohort.trend.improving, color: C.green },
                { label: 'Steady', value: cohort.trend.steady, color: C.neutral },
                { label: 'Declining', value: cohort.trend.declining, color: C.red },
              ]} />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, justifyContent: 'center' }}>
                {cohort.trend.deltas.map((d) => {
                  const v = d.avgDelta;
                  const good = v === null || v === 0 ? null : (d.higherBetter ? v > 0 : v < 0);
                  const color = good === null ? 'var(--text-muted)' : good ? 'var(--risk-low)' : 'var(--risk-high)';
                  return (
                    <div key={d.key} style={{ textAlign: 'center', minWidth: 66 }}>
                      <div className="stat-tile-label" style={{ fontSize: '0.68rem' }}>{d.label}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{v === null ? '—' : `${v > 0 ? '+' : ''}${v}`}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p className="text-muted">Loading…</p>}
        </div>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Muscles</h2>
            <span className="card-sub">Athletes flagged per muscle (weak = myodynamia · tight = tension)</span>
          </div></div>
          {cohort && muscles.length === 0 ? (
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>No muscle flags on record for this cohort.</div>
          ) : <MuscleBars items={muscles} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
