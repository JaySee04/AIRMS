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
import { DivergingBar, MetricDeltas, PeriodChart, Ring } from '@/components/charts/Charts';
import { BAND_COLOR } from '@/lib/bands';
import { api } from '@/lib/api';
import { GRAINS, type Grain } from '@/lib/periods';

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
/** What counts as a real change for one score, and where that number came from. */
interface ReliabilityScore {
  key: string;
  label: string;
  pairs: number;
  movedPairs: number;
  /** Typical error and minimal detectable change — null when not derivable. */
  te: number | null;
  mdc95: number | null;
  deadBand: number;
  sufficient: boolean;
  reason: string | null;
}
interface PeriodsPayload {
  grain: Grain;
  grainCounts?: Record<Grain, number>;
  periods: Period[];
  reliability?: {
    derived: boolean;
    anySufficient: boolean;
    minPairs: number;
    fallback: number;
    scores: ReliabilityScore[];
  };
  coverage: { rostered: number; tested: number; untested: number; tests: number };
  /** Whether what the programme holds on each athlete is still current. */
  recall?: {
    dueDays: number;
    current: number; dueSoon: number; overdue: number; never: number;
    medianAgeDays: number | null;
    athletes: Array<{ athleteId: string; lastScreened: string | null; ageDays: number | null; status: string }>;
  };
  betweenTests: {
    athletesWithRetest: number;
    pairs: number;
    intervalDays: { median: number | null; min: number | null; max: number | null };
    improved: number; declined: number; steady: number;
    bandMoves: { better: number; worse: number; same: number };
    deltas: Array<{
      key: string; label: string; higherBetter: boolean; avgDelta: number | null;
      direction: 'improving' | 'steady' | 'declining' | null;
      /** Pairs where the score actually changed, vs pairs where both readings existed. */
      movedPairs: number; comparedPairs: number;
      /** The threshold this score's direction was judged against. */
      deadBand?: number;
    }>;
  } | null;
}



const C = { ...BAND_COLOR, neutral: 'var(--text-muted)', blue: 'var(--risk-undertrained)' };

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
  const [dlBusy, setDlBusy] = useState(false);

  // The KPIs as a document. Sends the SAME query the page is showing (filters +
  // grain), because a report that silently covered a different scope than the
  // screen it was downloaded from is worse than no report.
  async function downloadKpiReport() {
    setDlBusy(true); setError(null);
    try {
      const qs = new URLSearchParams(f.query);
      qs.set('grain', grain);
      await api.downloadGet(
        `/screening-reports/programme-activity.pdf?${qs.toString()}`,
        `AIRMS-programme-activity-${grain}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally { setDlBusy(false); }
  }

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
  // Scores that were byte-identical across every retest pair. Called out by name
  // because an all-zero column is far more often an ingestion gap than a squad
  // that genuinely did not budge on a single measurement.
  const flatScores = (bt?.deltas ?? [])
    .filter((d) => d.comparedPairs > 0 && d.movedPairs === 0)
    .map((d) => d.label);

  // What "steady" means here, and whether that number was earned or assumed.
  // A dead band nobody can see is a threshold nobody can challenge, and this one
  // decides which movements get called real.
  const rel = data?.reliability;
  const derivedScores = (rel?.scores ?? []).filter((r) => r.sufficient);

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
          {/* flexShrink:0 kept this rigid at its content width, so on a phone the
              header ran past the card. It may wrap; it may not refuse to fit. */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={downloadKpiReport}
            disabled={dlBusy || !data}
            title="Download these KPIs as a PDF, using the filters and period grain currently shown"
          >
            {dlBusy ? 'Preparing…' : 'Download KPI report (PDF)'}
          </button>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 3, borderRadius: 8, flexWrap: 'wrap' }} role="group" aria-label="Period grain">
            {GRAINS.map((g) => {
              const count = data?.grainCounts?.[g.key];
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGrain(g.key)}
                  aria-pressed={grain === g.key}
                  disabled={count === 0}
                  title={count === undefined ? undefined
                    : count === 0 ? 'No screening periods in this selection'
                      : `${count} period${count === 1 ? '' : 's'} of screening in this selection`}
                  style={{
                    border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 'var(--fs-sm)', fontWeight: 600,
                    background: grain === g.key ? 'var(--brand-navy)' : 'transparent',
                    color: grain === g.key ? '#fff' : 'var(--text-muted)',
                    opacity: count === 0 ? 0.45 : 1,
                    cursor: count === 0 ? 'not-allowed' : 'pointer',
                    lineHeight: 1.2,
                  }}
                >
                  {g.label}
                  {count !== undefined && (
                    <span className="seg-btn-count">{count === 1 ? '1 period' : `${count} periods`}</span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {!data ? <p className="text-muted">Loading…</p> : data.periods.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
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
                  {/* Coverage says who was tested. This says whether what we hold
                      on them is still current — a roster can be 100% covered and
                      entirely out of date, and only this number shows it. */}
                  {data.recall && (
                    <div>
                      <span className="verdict-stat-label">Needing a rescreen</span>
                      <span
                        className="verdict-stat-value"
                        style={{ color: data.recall.overdue + data.recall.never > 0 ? 'var(--risk-high)' : undefined }}
                      >
                        {data.recall.overdue + data.recall.never}
                      </span>
                      <span className="verdict-stat-hint">
                        {[
                          data.recall.overdue ? `${data.recall.overdue} overdue` : null,
                          data.recall.never ? `${data.recall.never} never screened` : null,
                          data.recall.dueSoon ? `${data.recall.dueSoon} due soon` : null,
                        ].filter(Boolean).join(' · ')
                          || `all current · median ${data.recall.medianAgeDays ?? '—'} days old`}
                      </span>
                    </div>
                  )}
                </div>
                {data.recall && (
                  <p className="chart-note" style={{ marginTop: 8 }}>
                    A screening counts as current for <strong>{data.recall.dueDays} days</strong> (an ISN
                    setting, not a clinical standard). Last-screened dates are read across{' '}
                    <strong>all time</strong>, not the selected window, so narrowing the dates above
                    cannot make an athlete look unscreened. &ldquo;Never screened&rdquo; is counted apart
                    from &ldquo;overdue&rdquo;: it needs a first assessment, not a recall.
                  </p>
                )}
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
                            <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }} title={`${p.retestedWithin} athlete(s) tested more than once in this period`}> ({p.retestedWithin} re)</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.averages.overallIndicator ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.deltas ? <Move delta={p.deltas.overallIndicator.delta} higherBetter /> : <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>baseline</span>}
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
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 'var(--fs-sm)' }}>
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
          {/* Declined LEFT, improved RIGHT — matching the change chart on the
              dashboard, where the axis runs "worse ← change → better". Two
              panels in the same product that put improvement on opposite sides
              force the reader to re-learn the direction at each card, and the
              one who does not re-learn it reads the squad exactly backwards. */}
          <div style={{ marginBottom: 20 }}>
            <DivergingBar
              left={{ label: `${bt.declined} declined`, value: bt.declined, color: C.red }}
              right={{ label: `${bt.improved} improved`, value: bt.improved, color: C.green }}
              middle={{ label: 'unchanged', value: bt.steady }}
            />
          </div>
          <div className="verdict-stats" style={{ marginTop: 0, marginBottom: 20, borderTop: 'none', paddingTop: 0 }}>
            <div>
              <span className="verdict-stat-label">Median retest gap</span>
              <span className="verdict-stat-value">
                {bt.intervalDays.median === null ? '—' : bt.intervalDays.median}
                <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-muted)', fontWeight: 500 }}> days</span>
              </span>
              {/* "range 35–35 days" is a range in form only. When every pair
                  shares one gap that IS the finding — a fixed recall schedule
                  rather than a spread — and it should be said, not dressed as a
                  range the reader has to notice is degenerate. */}
              <span className="verdict-stat-hint">
                {bt.intervalDays.min === null || bt.intervalDays.max === null
                  ? 'how often athletes come back'
                  : bt.intervalDays.min === bt.intervalDays.max
                    ? 'every pair the same gap'
                    : `range ${bt.intervalDays.min}–${bt.intervalDays.max} days`}
              </span>
            </div>
            <div>
              <span className="verdict-stat-label">Retested athletes</span>
              <span className="verdict-stat-value">{bt.athletesWithRetest}</span>
              <span className="verdict-stat-hint">{bt.pairs} comparable pair{bt.pairs === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 8 }}>Band movement, test to test</div>
          <div style={{ marginBottom: 16 }}>
            <DistributionBar segments={[
              { label: 'Band improved', value: bt.bandMoves.better, color: C.green },
              { label: 'Band unchanged', value: bt.bandMoves.same, color: C.neutral },
              { label: 'Band worsened', value: bt.bandMoves.worse, color: C.red },
            ]} />
          </div>
          {/* Same shared-delta chart as the dashboard rather than six loose
              tiles: the tiles gave a −1.7 and a 0 identical visual weight, so
              the one score that moved did not stand out from the four that did
              not. `movedPairs` separates the two ways an average lands on zero —
              nothing changed, or changes cancelled — which the tiles rendered
              identically as "→ 0". */}
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 8 }}>Average change per score, test to test</div>
          <MetricDeltas
            valsHead="pairs that moved"
            metrics={bt.deltas.map((d) => {
              const flat = d.movedPairs === 0 && (d.comparedPairs ?? 0) > 0;
              return {
                key: d.key,
                label: d.label,
                from: null,
                to: null,
                delta: d.avgDelta,
                higherBetter: d.higherBetter,
                direction: d.direction,
                vals: flat ? 'none of them' : `${d.movedPairs} of ${d.comparedPairs}`,
                note: flat ? 'no change recorded' : undefined,
              };
            })}
            note={(
              <p className="chart-note">
                Averaged across all {bt.pairs} pair{bt.pairs === 1 ? '' : 's'}, so a bar is the typical
                move an athlete made between two of their own tests. Bars share one scale and point
                <strong> right for better</strong> — exercise risks improve by falling, so a drop there
                is drawn right like any other gain while the printed number keeps its true sign.
                {/* Where the improving/steady/declining line is drawn, stated. */}
                {derivedScores.length > 0 ? (
                  <>
                    {' '}A move counts as real only past that score&rsquo;s <strong>minimal detectable
                    change</strong> — {derivedScores.map((r) => `${r.label} ±${r.mdc95}`).join(', ')} —
                    computed from how much the score varies between one athlete&rsquo;s own repeat
                    screenings. Those repeats are months apart and contain genuine change as well as
                    measurement error, so this is an <em>upper bound</em> on the error: it under-calls
                    change rather than over-calling it.
                  </>
                ) : (
                  <>
                    {' '}Anything smaller than <strong>±{rel?.fallback ?? 2}</strong> is called steady.
                    That figure is an <strong>assumption, not a measurement</strong>: deriving a real
                    one needs {rel?.minPairs ?? 20} repeat screenings per score, and there
                    {bt.pairs === 1 ? ' is 1' : ` are ${bt.pairs}`}.
                  </>
                )}
                {flatScores.length > 0 && (
                  <>
                    {' '}<strong>{flatScores.join(', ')}</strong>{' '}
                    {flatScores.length === 1 ? 'was' : 'were'} identical in every pair — that is a
                    retest not re-measuring {flatScores.length === 1 ? 'it' : 'them'} rather than a
                    squad holding steady, and is worth checking at source.
                  </>
                )}
              </p>
            )}
          />

        </div>
      )}

      {data && bt && bt.pairs === 0 && (
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Between Successive Tests</h2>
            <span className="card-sub">Change measured within each athlete, across their own successive screenings.</span>
          </div></div>
          <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
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
