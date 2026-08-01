'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chart as ChartType } from 'chart.js';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { useIsDark, chartPalette } from '@/lib/chartTheme';

// Chart.js is loaded on demand inside the chart effect (dynamic import) so it
// stays out of this page's initial bundle — same treatment the athlete and
// medical dashboards give their chart components. Registration is idempotent.
async function loadChartJs() {
  const m = await import('chart.js');
  m.Chart.register(
    m.BarController, m.BarElement,
    m.LineController, m.LineElement, m.PointElement,
    m.LinearScale, m.CategoryScale,
    m.Legend, m.Tooltip, m.Title,
  );
  return m.Chart;
}

interface BucketRow { _id: string; count: number; }
interface MonthBucket { _id: { year: number; month: number }; count: number; }

interface AnalyticsSummary {
  total: number;
  recovering: number;
  athletesAffected: number;
  sportsAffected: number;
  byBodyPart: BucketRow[];
  byType: BucketRow[];
  bySeverity: BucketRow[];
  bySport: BucketRow[];
  byGender: BucketRow[];
  byProgram: BucketRow[];
  byMonth: MonthBucket[];
}

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'];
const GENDERS = ['Male', 'Female'];
const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];

// Age groups for Dr Thung's "by age group" filter ask.
interface ScreeningCohort {
  totalAthletes: number;
  screened: number;
  unscreened: number;
  averages: Record<string, number | null>;
  indicators: Array<{ key: string; label: string; ok: number; watch: number; high: number }>;
  topMyodynamia: Array<{ muscle: string; count: number }>;
  topTension: Array<{ muscle: string; count: number }>;
  trend?: {
    comparable: number;
    improving: number; declining: number; steady: number;
    bandMoves: { better: number; worse: number };
    deltas: Array<{ key: string; label: string; higherBetter: boolean; avgDelta: number | null }>;
  };
}

const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

// The athlete-level filter params shared by the injury summary and the screening
// cohort (sport / programme / gender / age). The summary layers its injury-only
// params (body part, injury type, dates) on top.
function athleteFilterParams(sport: string, gender: string, programme: string, ageGroupIndex: number): URLSearchParams {
  const params = new URLSearchParams();
  if (sport) params.set('sport', sport);
  if (gender) params.set('gender', gender);
  if (programme) params.set('program', programme);
  const ageGroup = AGE_GROUPS[ageGroupIndex];
  if (ageGroup.min !== undefined) params.set('ageMin', String(ageGroup.min));
  if (ageGroup.max !== undefined) params.set('ageMax', String(ageGroup.max));
  return params;
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [sport, setSport] = useState('');
  const [gender, setGender] = useState('');
  const [programme, setProgramme] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [injuryType, setInjuryType] = useState('');
  const [ageGroupIndex, setAgeGroupIndex] = useState(0); // 0 = "All ages"
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Trend chart bucketing — Dr Thung asked for both monthly (default) and
  // quarterly views to spot Q-to-Q seasonality (e.g. "Q4 high knee risk").
  const [trendBucket, setTrendBucket] = useState<'monthly' | 'quarterly'>('monthly');

  const isDark = useIsDark();

  // HoloMotion screening picture (latest report per athlete). Respects the
  // athlete-level filters — sport / programme / gender / age — so it tracks the
  // dashboard. The injury-only filters (body part, injury type, date) don't
  // apply, since a screening isn't an injury.
  const [screeningCohort, setScreeningCohort] = useState<ScreeningCohort | null>(null);
  useEffect(() => {
    const qs = athleteFilterParams(sport, gender, programme, ageGroupIndex).toString();
    api.get<ScreeningCohort>(`/athletes/analytics/screening${qs ? `?${qs}` : ''}`)
      .then(setScreeningCohort)
      .catch(() => setScreeningCohort(null));
  }, [sport, gender, programme, ageGroupIndex]);

  // Refs for the chart canvases
  const bodyPartRef = useRef<HTMLCanvasElement | null>(null);
  const typeRef = useRef<HTMLCanvasElement | null>(null);
  const sportRef = useRef<HTMLCanvasElement | null>(null);
  const monthRef = useRef<HTMLCanvasElement | null>(null);
  const chartsRef = useRef<ChartType[]>([]);

  async function fetchSummary() {
    try {
      setLoading(true);
      const params = athleteFilterParams(sport, gender, programme, ageGroupIndex);
      if (bodyPart) params.set('bodyPart', bodyPart);
      if (injuryType) params.set('injuryType', injuryType);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      const data = await api.get<AnalyticsSummary>(
        `/injuries/analytics/summary${qs ? `?${qs}` : ''}`,
      );
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  // Initial sport list (for filter dropdown)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]);
        if (!cancelled) setSports(s);
      } catch { /* swallow — filter still usable without */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch on filter change
  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, gender, programme, bodyPart, injuryType, ageGroupIndex, startDate, endDate]);

  // Aggregate the byMonth series into the active bucket (monthly or
  // quarterly). Quarterly view sums each calendar quarter (Q1=Jan-Mar etc.)
  // and labels as `YYYY-Qn`. Also finds the peak bucket so we can call it
  // out under the chart — Dr Thung's "when is the most critical time" ask.
  const trend = useMemo(() => {
    if (!summary) return { labels: [], values: [], peak: null as null | { label: string; count: number } };
    if (trendBucket === 'monthly') {
      const labels = summary.byMonth.map((m) => `${m._id.year}-${String(m._id.month).padStart(2, '0')}`);
      const values = summary.byMonth.map((m) => m.count);
      let peakIdx = -1;
      values.forEach((v, i) => { if (peakIdx < 0 || v > values[peakIdx]) peakIdx = i; });
      const peak = peakIdx >= 0 && values[peakIdx] > 0 ? { label: labels[peakIdx], count: values[peakIdx] } : null;
      return { labels, values, peak };
    }
    // Quarterly aggregation
    const buckets = new Map<string, number>();
    summary.byMonth.forEach((m) => {
      const q = Math.floor((m._id.month - 1) / 3) + 1;
      const key = `${m._id.year}-Q${q}`;
      buckets.set(key, (buckets.get(key) ?? 0) + m.count);
    });
    const labels = Array.from(buckets.keys()).sort();
    const values = labels.map((l) => buckets.get(l) ?? 0);
    let peakIdx = -1;
    values.forEach((v, i) => { if (peakIdx < 0 || v > values[peakIdx]) peakIdx = i; });
    const peak = peakIdx >= 0 && values[peakIdx] > 0 ? { label: labels[peakIdx], count: values[peakIdx] } : null;
    return { labels, values, peak };
  }, [summary, trendBucket]);

  // Render the charts. Chart.js arrives via dynamic import, so this effect is
  // async with a cancellation flag — a re-run (filter/theme change) or unmount
  // while the library is still loading must not paint stale charts.
  useEffect(() => {
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];
    if (!summary) return;

    let cancelled = false;
    (async () => {
    const Chart = await loadChartJs();
    if (cancelled) return;

    const pal = chartPalette(isDark);
    // Shared axis styling so grid lines + ticks stay legible in both themes.
    const cat = { grid: { color: pal.grid }, ticks: { color: pal.tick } };
    const val = { grid: { color: pal.grid }, ticks: { color: pal.tick, precision: 0 }, beginAtZero: true };

    // By body part — ordered to match BODY_PARTS list
    const bpData = BODY_PARTS.map((b) => summary.byBodyPart.find((x) => x._id === b)?.count ?? 0);
    if (bodyPartRef.current) {
      const ctx = bodyPartRef.current.getContext('2d');
      if (ctx) {
        chartsRef.current.push(new Chart(ctx, {
          type: 'bar',
          data: { labels: BODY_PARTS, datasets: [{ label: 'Cases', data: bpData, backgroundColor: pal.bar, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: cat, y: val } },
        }));
      }
    }

    // By injury type
    const itData = INJURY_TYPES.map((t) => summary.byType.find((x) => x._id === t)?.count ?? 0);
    if (typeRef.current) {
      const ctx = typeRef.current.getContext('2d');
      if (ctx) {
        chartsRef.current.push(new Chart(ctx, {
          type: 'bar',
          data: { labels: INJURY_TYPES, datasets: [{ label: 'Cases', data: itData, backgroundColor: pal.gold, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: cat, y: val } },
        }));
      }
    }

    // By sport — horizontal bars, already sorted descending by the backend so
    // the most-affected sport sits at the top. Lets the user filter by injury
    // type / body part and see at a glance which sports those injuries hit.
    if (sportRef.current) {
      const ctx = sportRef.current.getContext('2d');
      if (ctx) {
        const sportLabels = summary.bySport.map((s) => s._id || 'Unknown');
        const sportData = summary.bySport.map((s) => s.count);
        chartsRef.current.push(new Chart(ctx, {
          type: 'bar',
          data: { labels: sportLabels, datasets: [{ label: 'Cases', data: sportData, backgroundColor: pal.bar, borderRadius: 4 }] },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: val, y: cat },
          },
        }));
      }
    }

    // Trend chart — bucket-aware (monthly or quarterly)
    if (monthRef.current) {
      const ctx = monthRef.current.getContext('2d');
      if (ctx) {
        chartsRef.current.push(new Chart(ctx, {
          type: 'line',
          data: {
            labels: trend.labels,
            datasets: [{
              label: 'Cases',
              data: trend.values,
              borderColor: pal.bar,
              backgroundColor: pal.barFill,
              tension: 0.3,
              // Highlight the peak point in gold so the "critical time" is
              // visible at a glance, not just buried in the line shape.
              pointBackgroundColor: trend.values.map((_, i) => (trend.peak && trend.labels[i] === trend.peak.label ? pal.gold : pal.bar)),
              pointRadius: trend.values.map((_, i) => (trend.peak && trend.labels[i] === trend.peak.label ? 6 : 4)),
            }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: cat, y: val } },
        }));
      }
    }
    })();

    return () => {
      cancelled = true;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [summary, trend, isDark]);

  function reset() {
    setSport(''); setGender(''); setProgramme('');
    setBodyPart(''); setInjuryType('');
    setAgeGroupIndex(0);
    setStartDate(''); setEndDate('');
  }

  // Build the /admin/reports link with the current dashboard filter state
  // URL-encoded as query params. The reports page reads them on mount so the
  // analyst doesn't re-enter the same filters they already chose here.
  const reportsHref = useMemo(() => {
    const p = new URLSearchParams();
    if (sport)        p.set('sport', sport);
    if (gender)       p.set('gender', gender);
    if (programme)    p.set('program', programme);
    if (bodyPart)     p.set('bodyPart', bodyPart);
    if (injuryType)   p.set('injuryType', injuryType);
    if (ageGroupIndex) p.set('ageGroupIndex', String(ageGroupIndex));
    if (startDate)    p.set('startDate', startDate);
    if (endDate)      p.set('endDate', endDate);
    const qs = p.toString();
    return `/admin/reports${qs ? `?${qs}` : ''}`;
  }, [sport, gender, programme, bodyPart, injuryType, ageGroupIndex, startDate, endDate]);

  // Hide rule: a chart's dimension is hidden iff a filter narrows it to a
  // single value.
  const show = {
    sport: !sport,
    bodyPart: !bodyPart,
    type: !injuryType,
    gender: !gender,
    programme: !programme,
  };

  return (
    <DashboardLayout allowedRoles={['admin']} title="Screening Analytics">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Filters grouped by scope: the Cohort set narrows every chart AND the
          screening-cohort section below; the Injury-only set narrows just the
          injury charts (the screening section ignores body part / type / dates).
          The grouping is what tells the user this — no prose caveat needed. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <fieldset className="filter-group">
            <legend className="filter-group-legend">Cohort <span>· applies everywhere</span></legend>
            <div className="filter-group-body">
              <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                <label>Sport</label>
                <select value={sport} onChange={(e) => setSport(e.target.value)}>
                  <option value="">All</option>
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
                <label>Age Group</label>
                <select value={ageGroupIndex} onChange={(e) => setAgeGroupIndex(Number(e.target.value))}>
                  {AGE_GROUPS.map((g, i) => (<option key={g.label} value={i}>{g.label}</option>))}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-group-legend">Injury only <span>· injury charts</span></legend>
            <div className="filter-group-body">
              <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                <label>Body Part</label>
                <select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
                  <option value="">All</option>
                  {BODY_PARTS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                <label>Injury Type</label>
                <select value={injuryType} onChange={(e) => setInjuryType(e.target.value)}>
                  <option value="">All</option>
                  {INJURY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                <label>From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                <label>To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </fieldset>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginLeft: 'auto' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={reset}>Reset</button>
            <Link href={reportsHref} className="btn btn-gold btn-sm">Generate PDF Report</Link>
          </div>
        </div>
      </div>

      {/* The HoloMotion screening picture is the primary content; the injury-log
          analytics below it are ordered second (order:2) via this flex column so
          HoloMotion leads, per the HoloMotion-only scope. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ order: 2 }}>
      <div className="section-divider">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Injury Log Analytics</h2>
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
          From the manual injury log — not HoloMotion. Flagged for review under the HoloMotion-only scope; see HOLOMOTION_SCOPE_2026-08.
        </span>
      </div>

      <div className="stat-grid" style={{ marginTop: 14 }}>
        <div className="stat-tile">
          <div className="stat-tile-label">Total Cases</div>
          <div className="stat-tile-value">{loading ? '…' : summary?.total ?? 0}</div>
          <div className="stat-tile-delta">{loading ? '' : 'Within filter'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Athletes Affected</div>
          <div className="stat-tile-value">{loading ? '…' : summary?.athletesAffected ?? 0}</div>
          <div className="stat-tile-delta">Unique athletes</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Currently Recovering</div>
          <div className="stat-tile-value">{loading ? '…' : summary?.recovering ?? 0}</div>
          <div className="stat-tile-delta">Active cases</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Sports Affected</div>
          <div className="stat-tile-value">{loading ? '…' : summary?.sportsAffected ?? 0}</div>
          <div className="stat-tile-delta">Distinct sports</div>
        </div>
      </div>

      {/* Big-chart row — dimensions with the most categories.
          Auto-fit reflows when a card is hidden so we don't leave a gap. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
        {show.sport && (
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Sport</h2>
                <span className="card-sub">
                  {summary && summary.bySport.length > 0
                    ? `${summary.bySport.length} sport${summary.bySport.length === 1 ? '' : 's'} affected`
                    : 'No sports match the current filter'}
                </span>
              </div>
            </div>
            <div style={{ position: 'relative', height: Math.min(300, Math.max(200, (summary?.bySport.length ?? 0) * 22 + 40)) }}>
              <canvas ref={sportRef} />
            </div>
          </div>
        )}
        {show.bodyPart && (
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Body Part</h2>
              </div>
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <canvas ref={bodyPartRef} />
            </div>
          </div>
        )}
        {show.type && (
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Type</h2>
              </div>
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <canvas ref={typeRef} />
            </div>
          </div>
        )}
      </div>

      {/* Low-cardinality breakdowns — simple number tiles read better than
          tiny bar charts for two- or three-value dimensions. */}
      {(show.gender || show.programme) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 20 }}>
          {show.gender && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Gender</h2>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {GENDERS.map((g) => {
                  const n = summary?.byGender.find((x) => x._id === g)?.count ?? 0;
                  return (
                    <div key={g} style={{ flex: '1 1 80px' }}>
                      <div className="stat-tile-label">{g}</div>
                      <div className="stat-tile-value">{loading ? '…' : n}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {show.programme && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Programme</h2>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {PROGRAMMES.map((p) => {
                  const n = summary?.byProgram.find((x) => x._id === p)?.count ?? 0;
                  return (
                    <div key={p} style={{ flex: '1 1 70px' }}>
                      <div className="stat-tile-label">{p}</div>
                      <div className="stat-tile-value">{loading ? '…' : n}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Cases Over Time</h2>
            <span className="card-sub">
              {trendBucket === 'monthly' ? 'Monthly counts' : 'Quarterly counts'}
              {trend.peak && (
                <> · Peak: <strong>{trend.peak.label}</strong> ({trend.peak.count} case{trend.peak.count === 1 ? '' : 's'})</>
              )}
            </span>
          </div>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              className={`region-chip${trendBucket === 'monthly' ? ' active' : ''}`}
              onClick={() => setTrendBucket('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`region-chip${trendBucket === 'quarterly' ? ' active' : ''}`}
              onClick={() => setTrendBucket('quarterly')}
            >
              Quarterly
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', height: 240 }}>
          <canvas ref={monthRef} />
        </div>
      </div>
      </div>{/* end injury log analytics (order:2) */}

      <div style={{ order: 1 }}>
      {/* ── HoloMotion screening cohort ─────────────────────────────────────
          The screening side of the athlete population — sourced from the
          ingested HoloMotion reports (not the injury log). Proportion bars
          show how each risk indicator distributes across the report's own
          OK / Watch / High bands. */}
      {screeningCohort && (
        <>
          <div className="section-divider" style={{ marginTop: 28 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Screening Cohort — HoloMotion</h2>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              Per-athlete latest report · responds to the Cohort filters only
            </span>
          </div>

          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat-tile">
              <div className="stat-tile-label">Athletes Screened</div>
              <div className="stat-tile-value">{screeningCohort.screened}<span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}> / {screeningCohort.totalAthletes}</span></div>
              <div className="stat-tile-delta">{screeningCohort.unscreened} awaiting a report</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">Avg Total Score</div>
              <div className="stat-tile-value">{screeningCohort.averages.overallActivityScore ?? '—'}</div>
              <div className="stat-tile-delta">Physical quality · / 100</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">Avg Exercise Risks</div>
              <div className="stat-tile-value">{screeningCohort.averages.injuryRiskIndex ?? '—'}</div>
              <div className="stat-tile-delta">Lower is better</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">High Indicators</div>
              <div className="stat-tile-value">
                {screeningCohort.indicators.reduce((s, i) => s + i.high, 0)}
              </div>
              <div className="stat-tile-delta">Indicator readings above 25</div>
            </div>
          </div>

          {/* Screening trend — previous vs latest HoloMotion report (the
              HoloMotion-native trend, replacing injury cases-over-time as the
              primary trend). Responds to the Cohort filters. */}
          {screeningCohort.trend && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header"><div>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Trend — previous vs latest</h2>
                <span className="card-sub">
                  {screeningCohort.trend.comparable > 0
                    ? `${screeningCohort.trend.comparable} athlete${screeningCohort.trend.comparable === 1 ? '' : 's'} with a repeat HoloMotion report`
                    : 'Needs a repeat report per athlete'}
                </span>
              </div></div>
              {screeningCohort.trend.comparable === 0 ? (
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  No athlete in this cohort has two screenings yet — import a newer HoloMotion report to compare against the previous one.
                </div>
              ) : (
                <>
                  <div className="stat-grid" style={{ marginBottom: 8 }}>
                    <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-low)' }}>
                      <div className="stat-tile-label">Improving</div>
                      <div className="stat-tile-value">{screeningCohort.trend.improving}</div>
                      <div className="stat-tile-delta">indicator up ≥ 2</div>
                    </div>
                    <div className="stat-tile" style={{ borderTop: '3px solid var(--risk-high)' }}>
                      <div className="stat-tile-label">Declining</div>
                      <div className="stat-tile-value">{screeningCohort.trend.declining}</div>
                      <div className="stat-tile-delta">indicator down ≥ 2</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-tile-label">Steady</div>
                      <div className="stat-tile-value">{screeningCohort.trend.steady}</div>
                      <div className="stat-tile-delta">within ±2</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-tile-label">Band movement</div>
                      <div className="stat-tile-value">
                        <span style={{ color: 'var(--risk-low)' }}>{screeningCohort.trend.bandMoves.better}↑</span>{' '}
                        <span style={{ color: 'var(--risk-high)' }}>{screeningCohort.trend.bandMoves.worse}↓</span>
                      </div>
                      <div className="stat-tile-delta">to a safer / riskier band</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
                    {screeningCohort.trend.deltas.map((d) => {
                      const v = d.avgDelta;
                      const good = v === null || v === 0 ? null : (d.higherBetter ? v > 0 : v < 0);
                      const color = good === null ? 'var(--text-muted)' : good ? 'var(--risk-low)' : 'var(--risk-high)';
                      const sign = v !== null && v > 0 ? '+' : '';
                      return (
                        <div key={d.key} style={{ minWidth: 96 }}>
                          <div className="stat-tile-label">{d.label}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{v === null ? '—' : `${sign}${v}`}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.74rem', marginTop: 10, marginBottom: 0 }}>
                    Average change from each athlete&apos;s previous HoloMotion report to their latest
                    (Total / ROM / Stability / Symmetry higher = better; Exercise Risks lower = better).
                  </p>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators Across the Cohort</h2>
                  <span className="card-sub">Share of screened athletes in each band, per indicator</span>
                </div>
              </div>
              <div className="cohort-bars">
                {screeningCohort.indicators.map((ind) => {
                  const total = ind.ok + ind.watch + ind.high || 1;
                  return (
                    <div
                      key={ind.key}
                      className="cohort-bar-row"
                      title={`${ind.label}: ${ind.ok} Low · ${ind.watch} Watch · ${ind.high} Elevated`}
                    >
                      <div className="cohort-bar-label">{ind.label}</div>
                      <div className="cohort-bar-track">
                        {ind.ok > 0 && <div className="cohort-bar-seg cohort-bar-seg--ok" style={{ width: `${(ind.ok / total) * 100}%` }}>{ind.ok}</div>}
                        {ind.watch > 0 && <div className="cohort-bar-seg cohort-bar-seg--watch" style={{ width: `${(ind.watch / total) * 100}%` }}>{ind.watch}</div>}
                        {ind.high > 0 && <div className="cohort-bar-seg cohort-bar-seg--high" style={{ width: `${(ind.high / total) * 100}%` }}>{ind.high}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Band words must match the strips, the alert banner and the PDF
                  reports — see the vocabulary note in lib/screeningAlerts.ts. */}
              <div className="screening-strip-legend">
                <span><span className="legend-swatch legend-swatch--ok" /> Low ≤ 15</span>
                <span><span className="legend-swatch legend-swatch--watch" /> Watch 16–25</span>
                <span><span className="legend-swatch legend-swatch--high" /> Elevated &gt; 25</span>
                <span className="text-muted">
                  Report prints Low 0–15 · Medium 16–55; AIRMS splits Medium into Watch / Elevated
                </span>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Muscles</h2>
                  <span className="card-sub">Myodynamia deficiency &amp; tension</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {([['Myodynamia Deficiency', screeningCohort.topMyodynamia, 'myo'], ['Muscle Tension', screeningCohort.topTension, 'tension']] as const).map(([title, list, tone]) => {
                  const max = Math.max(1, ...list.map((m) => m.count));
                  return (
                    <div key={title} style={{ flex: '1 1 220px' }}>
                      <div className={`muscle-chip-title muscle-chip-title--${tone}`}>{title}</div>
                      {list.length === 0 ? (
                        <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>No flags on record</div>
                      ) : (
                        <div className="muscle-rank" style={{ marginTop: 8 }}>
                          {list.map((m) => (
                            <div key={m.muscle} className="muscle-rank-row" title={`${m.muscle}: flagged for ${m.count} athlete${m.count === 1 ? '' : 's'}`}>
                              <span className="muscle-rank-name">{m.muscle}</span>
                              <span className={`muscle-rank-bar muscle-rank-bar--${tone}`} style={{ width: `${(m.count / max) * 100}%` }} />
                              <span className="muscle-rank-count">{m.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      </div>{/* end HoloMotion screening (order:1) */}
      </div>{/* end reordered sections */}
    </DashboardLayout>
  );
}
