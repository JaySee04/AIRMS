'use client';

// Admin · Programme Activity — how the SCREENING PROGRAMME is performing, as
// opposed to /admin/dashboard, which is how the ATHLETES are. Two different
// questions for the same administrator, so they get two pages rather than one
// long scroll:
//
//   Screening Analytics  →  "what state is the squad in right now?"
//   Programme Activity   →  "are we screening enough people, and is the
//                            population moving in the right direction?"
//
// Answers Dr Thung's ask for progress "from year to year, quarter to quarter,
// and see whether it's actually drop" (2026-04-24, 12:39). Takes the same
// cohort slicers as the analytics page, because a period comparison across the
// whole institution moves for reasons that have nothing to do with any one
// squad — narrowing is how you make it like-for-like.

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CohortFilters, { useCohortFilters } from '@/components/admin/CohortFilters';
import DistributionBar from '@/components/admin/DistributionBar';
import StaffActivity from '@/components/admin/StaffActivity';
import { DivergingBar, PeriodChart, Ring } from '@/components/charts/Charts';
import { api } from '@/lib/api';

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

const C = { green: 'var(--risk-low)', amber: 'var(--risk-moderate)', red: 'var(--risk-high)', neutral: 'var(--text-muted)', blue: 'var(--risk-undertrained)' };

// A delta, showing BOTH which way the number moved and whether that is good.
// The arrow tracks the sign; the colour tracks the score's orientation, since
// exercise risks improve by going down. Tying the arrow to goodness instead
// produced "▲ -2.2" for a risk that had fallen — an up-arrow on a negative
// number, which reads as a contradiction.
function Move({ delta, higherBetter, compact = false }: { delta: number | null; higherBetter: boolean; compact?: boolean }) {
  if (delta === null || delta === 0) {
    return <span className="text-muted" style={{ fontSize: compact ? '0.75rem' : '0.85rem' }}>→ 0</span>;
  }
  const better = higherBetter ? delta > 0 : delta < 0;
  return (
    <span
      title={`${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} — ${better ? 'better' : 'worse'}`}
      style={{ color: better ? C.green : C.red, fontWeight: 700, fontSize: compact ? '0.75rem' : '0.85rem' }}
    >
      {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
    </span>
  );
}

// Throughput bar: tests per period, with the distinct-athlete share drawn
// inside it, so a period of many retests looks different from a period of many
// new athletes.
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

export default function AdminActivity() {
  const f = useCohortFilters();
  const [grain, setGrain] = useState<Grain>('quarter');
  const [data, setData] = useState<PeriodsPayload | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]);
      if (!cancelled) setSports(s);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams(f.query);
        qs.set('grain', grain);
        const d = await api.get<PeriodsPayload>(`/athletes/analytics/periods?${qs.toString()}`);
        if (!cancelled) { setData(d); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load programme activity');
      }
    })();
    return () => { cancelled = true; };
  }, [f.query, grain]);

  const bt = data?.betweenTests;

  return (
    <DashboardLayout allowedRoles={['admin', 'executive']} title="Programme Activity">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <CohortFilters
        f={f}
        sports={sports}
        note="Period averages mix cohorts — a period with a different intake reads differently for that reason alone. Narrow the filters for a like-for-like comparison."
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Throughput</h2>
            <span className="card-sub">How many athletes were tested per period, and which way population scores are moving.</span>
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

        {!data ? <p className="text-muted">Loading…</p> : data.periods.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            No screenings on record for this cohort, so there is no activity to report.
          </div>
        ) : (
          <>
            {/* Coverage as a ring beside the work actually done over time.
                Replaces four flat tiles, one of which counted PERIODS — a KPI of
                the axis rather than of anything achieved. */}
            <div className="verdict" style={{ marginBottom: 24 }}>
              <Ring
                value={data.coverage.tested}
                total={data.coverage.rostered}
                label="Roster covered"
                sublabel={data.coverage.untested > 0
                  ? `${data.coverage.untested} never tested`
                  : 'Every athlete has been tested'}
              />
              <div className="verdict-main">
                <div style={{ marginTop: 18 }}>
                  <PeriodChart
                    points={data.periods.map((p) => ({
                      key: p.key,
                      label: p.label,
                      value: p.tests,
                      line: p.averages.overallIndicator ?? null,
                    }))}
                    valueLabel="Tests performed"
                    lineLabel="Average indicator"
                    height={150}
                  />
                </div>
                <div className="verdict-stats">
                  <div>
                    <span className="verdict-stat-label">Tests performed</span>
                    <span className="verdict-stat-value">{data.coverage.tests}</span>
                    <span className="verdict-stat-hint">across {data.periods.length} {data.grain === 'year' ? 'year' : data.grain}{data.periods.length === 1 ? '' : 's'}</span>
                  </div>
                  <div>
                    <span className="verdict-stat-label">Athletes tested</span>
                    <span className="verdict-stat-value">{data.coverage.tested}</span>
                    <span className="verdict-stat-hint">of {data.coverage.rostered} on the roster</span>
                  </div>
                  <div>
                    <span className="verdict-stat-label">Tests per athlete</span>
                    <span className="verdict-stat-value">
                      {data.coverage.tested > 0 ? (data.coverage.tests / data.coverage.tested).toFixed(1) : '—'}
                    </span>
                    <span className="verdict-stat-hint">retest depth, not just reach</span>
                  </div>
                </div>
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
                    const maxTests = Math.max(...data.periods.map((p) => p.tests));
                    // Newest first: the period under discussion is the recent one.
                    return [...data.periods].reverse().map((p) => (
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

      {/* Within-athlete pairs: each athlete is their own control, which is the
          only reading that can claim athletes improved rather than the tested
          population having changed. */}
      {bt && bt.pairs > 0 && (
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Between Successive Tests</h2>
            <span className="card-sub">
              Every consecutive pair of tests for the same athlete ({bt.pairs} pair{bt.pairs === 1 ? '' : 's'} across {bt.athletesWithRetest} athlete{bt.athletesWithRetest === 1 ? '' : 's'}).
              Each athlete is their own comparison, so this measures change rather than a shift in who was tested.
            </span>
          </div></div>
          {/* Improved vs declined GROWING APART from a shared centre. As two
              stat tiles ("10" and "9" in separate boxes) the eye never actually
              compared them, which is the single thing this panel exists to
              show. */}
          <div style={{ marginBottom: 20 }}>
            <DivergingBar
              left={{ label: `${bt.improved} improved`, value: bt.improved, color: C.green }}
              right={{ label: `${bt.declined} declined`, value: bt.declined, color: C.red }}
              middle={{ label: 'unchanged', value: bt.steady }}
            />
          </div>
          <div className="verdict-stats" style={{ marginTop: 0, marginBottom: 20, borderTop: 'none', paddingTop: 0 }}>
            <div>
              <span className="verdict-stat-label">Median retest gap</span>
              <span className="verdict-stat-value">
                {bt.intervalDays.median === null ? '—' : bt.intervalDays.median}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> days</span>
              </span>
              <span className="verdict-stat-hint">
                {bt.intervalDays.min !== null && bt.intervalDays.max !== null
                  ? `range ${bt.intervalDays.min}–${bt.intervalDays.max} days`
                  : 'how often athletes come back'}
              </span>
            </div>
            <div>
              <span className="verdict-stat-label">Retested athletes</span>
              <span className="verdict-stat-value">{bt.athletesWithRetest}</span>
              <span className="verdict-stat-hint">{bt.pairs} comparable pair{bt.pairs === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>Band movement, test to test</div>
          <div style={{ marginBottom: 16 }}>
            <DistributionBar segments={[
              { label: 'Band improved', value: bt.bandMoves.better, color: C.green },
              { label: 'Band unchanged', value: bt.bandMoves.same, color: C.neutral },
              { label: 'Band worsened', value: bt.bandMoves.worse, color: C.red },
            ]} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>Average change per score, test to test</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {bt.deltas.map((d) => (
              <div key={d.key} style={{ textAlign: 'center', minWidth: 78 }}>
                <div className="stat-tile-label" style={{ fontSize: '0.68rem' }}>{d.label}</div>
                <div><Move delta={d.avgDelta} higherBetter={d.higherBetter} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && bt && bt.pairs === 0 && (
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Between Successive Tests</h2>
            <span className="card-sub">Change measured within each athlete, across their own successive screenings.</span>
          </div></div>
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            No athlete in this cohort has been screened twice yet, so there is nothing to compare test to test.
          </div>
        </div>
      )}
      {/* Who actually did the work. "Programme activity" without the people in
          it measures only the athletes; this is the half that showcases the
          staff — imports committed, overrides recorded, norms governed — and it
          is the same component (and endpoint) the Activity Log uses, so the two
          pages cannot disagree about who did what. */}
      <div style={{ marginTop: 20 }}>
        <StaffActivity />
      </div>

    </DashboardLayout>
  );
}
