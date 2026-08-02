'use client';

// Admin · Screening Analytics. A HoloMotion-only, chart-driven overview of the
// screened population — coverage, band distribution, average physical-quality
// scores, per-indicator risk spread, previous-vs-latest movement, and muscle
// hotspots. Every panel follows the cohort filters (sport / programme / gender /
// age), so "by sport / by gender / by age group" (Dr Thung) is the interaction.
// Injury-log analytics were removed 2026-08-02 (HoloMotion-only scope).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chart as ChartType } from 'chart.js';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { useIsDark, chartPalette } from '@/lib/chartTheme';

async function loadChartJs() {
  const m = await import('chart.js');
  m.Chart.register(
    m.BarController, m.BarElement,
    m.DoughnutController, m.ArcElement,
    m.LinearScale, m.CategoryScale,
    m.Legend, m.Tooltip,
  );
  return m.Chart;
}

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

const GENDERS = ['Male', 'Female'];
const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];
const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

// Band colours — match the traffic-light used everywhere else.
const BAND = { green: '#2e9e5b', amber: '#d99a16', red: '#d14b4b', none: '#9aa5b1' };

export default function AdminDashboard() {
  const [cohort, setCohort] = useState<ScreeningCohort | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sport, setSport] = useState('');
  const [gender, setGender] = useState('');
  const [programme, setProgramme] = useState('');
  const [ageGroupIndex, setAgeGroupIndex] = useState(0);

  const isDark = useIsDark();

  const bandRef = useRef<HTMLCanvasElement | null>(null);
  const scoresRef = useRef<HTMLCanvasElement | null>(null);
  const indicatorsRef = useRef<HTMLCanvasElement | null>(null);
  const trendRef = useRef<HTMLCanvasElement | null>(null);
  const muscleRef = useRef<HTMLCanvasElement | null>(null);
  const charts = useRef<ChartType[]>([]);

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
        const data = await api.get<ScreeningCohort>(`/athletes/analytics/screening${qs ? `?${qs}` : ''}`);
        if (!cancelled) { setCohort(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sport, gender, programme, ageGroupIndex]);

  const elevatedTotal = useMemo(
    () => (cohort ? cohort.indicators.reduce((s, i) => s + i.high, 0) : 0),
    [cohort],
  );

  useEffect(() => {
    charts.current.forEach((c) => c.destroy());
    charts.current = [];
    if (!cohort) return;
    let cancelled = false;
    (async () => {
      const Chart = await loadChartJs();
      if (cancelled) return;
      const pal = chartPalette(isDark);
      const cat = { grid: { color: pal.grid }, ticks: { color: pal.tick } };
      const val = { grid: { color: pal.grid }, ticks: { color: pal.tick, precision: 0 }, beginAtZero: true };
      const legend = { labels: { color: pal.tick, boxWidth: 12, font: { size: 11 } } };
      // Shared doughnut builder — entries are [label, value, colour].
      const doughnut = (canvas: HTMLCanvasElement, entries: ReadonlyArray<readonly [string, number, string]>) => new Chart(canvas, {
        type: 'doughnut',
        data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((e) => e[2]), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', ...legend } } },
      });

      // Band distribution — doughnut
      if (bandRef.current) {
        const bd = cohort.bandDistribution;
        charts.current.push(doughnut(bandRef.current, [['Safe', bd.green, BAND.green], ['Needs attention', bd.amber, BAND.amber], ['Immediate', bd.red, BAND.red]]));
      }

      // Average physical-quality scores — bar (0–100, higher better)
      if (scoresRef.current) {
        const a = cohort.averages;
        const rows: Array<[string, number | null]> = [['Total', a.overallActivityScore], ['ROM', a.mobility], ['Stability', a.stability], ['Symmetry', a.symmetry]];
        charts.current.push(new Chart(scoresRef.current, {
          type: 'bar',
          data: { labels: rows.map((r) => r[0]), datasets: [{ label: 'Cohort average', data: rows.map((r) => r[1] ?? 0), backgroundColor: pal.bar, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: cat, y: { ...val, max: 100 } } },
        }));
      }

      // Risk indicators by band — stacked bar
      if (indicatorsRef.current) {
        charts.current.push(new Chart(indicatorsRef.current, {
          type: 'bar',
          data: {
            labels: cohort.indicators.map((i) => i.label),
            datasets: [
              { label: 'Low', data: cohort.indicators.map((i) => i.ok), backgroundColor: BAND.green, borderRadius: 2 },
              { label: 'Watch', data: cohort.indicators.map((i) => i.watch), backgroundColor: BAND.amber, borderRadius: 2 },
              { label: 'Elevated', data: cohort.indicators.map((i) => i.high), backgroundColor: BAND.red, borderRadius: 2 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', ...legend } }, scales: { x: { ...cat, stacked: true }, y: { ...val, stacked: true } } },
        }));
      }

      // Screening momentum — doughnut (previous vs latest)
      if (trendRef.current) {
        const t = cohort.trend;
        charts.current.push(doughnut(trendRef.current, [['Improving', t.improving, BAND.green], ['Declining', t.declining, BAND.red], ['Steady', t.steady, BAND.none]]));
      }

      // Muscle hotspots — horizontal bar (myodynamia + tension merged, top 8)
      if (muscleRef.current) {
        const merged = [
          ...cohort.topMyodynamia.map((m) => ({ label: `${m.muscle} (weak)`, count: m.count, weak: true })),
          ...cohort.topTension.map((m) => ({ label: `${m.muscle} (tight)`, count: m.count, weak: false })),
        ].sort((x, y) => y.count - x.count).slice(0, 8);
        charts.current.push(new Chart(muscleRef.current, {
          type: 'bar',
          data: { labels: merged.map((m) => m.label), datasets: [{ label: 'Athletes', data: merged.map((m) => m.count), backgroundColor: merged.map((m) => (m.weak ? pal.bar : BAND.red)), borderRadius: 4 }] },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: val, y: cat } },
        }));
      }
    })();
    return () => { cancelled = true; charts.current.forEach((c) => c.destroy()); charts.current = []; };
  }, [cohort, isDark, elevatedTotal]);

  function reset() { setSport(''); setGender(''); setProgramme(''); setAgeGroupIndex(0); }

  const a = cohort?.averages;

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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.4fr)', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Overall Risk Distribution</h2>
            <span className="card-sub">Traffic-light band, latest screening per athlete</span>
          </div></div>
          <div style={{ position: 'relative', height: 260 }}><canvas ref={bandRef} /></div>
        </div>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Average Physical-Quality Scores</h2>
            <span className="card-sub">Cohort mean · 0–100, higher is better</span>
          </div></div>
          <div style={{ position: 'relative', height: 260 }}><canvas ref={scoresRef} /></div>
        </div>
      </div>

      {/* Row 2 — risk indicators by band */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Exercise-Risk Indicators by Band</h2>
          <span className="card-sub">How many screened athletes fall in each band per indicator (Low ≤15 · Watch 16–25 · Elevated &gt;25)</span>
        </div></div>
        <div style={{ position: 'relative', height: 300 }}><canvas ref={indicatorsRef} /></div>
      </div>

      {/* Row 3 — screening trend + muscle hotspots */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1.2fr)', gap: 20, marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Screening Trend</h2>
            <span className="card-sub">
              {cohort ? `${cohort.trend.comparable} athlete${cohort.trend.comparable === 1 ? '' : 's'} with a repeat report` : ''}
            </span>
          </div></div>
          {cohort && cohort.trend.comparable === 0 ? (
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>No athlete in this cohort has two screenings yet — import a newer HoloMotion report to compare.</div>
          ) : (
            <>
              <div style={{ position: 'relative', height: 200 }}><canvas ref={trendRef} /></div>
              {cohort && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
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
              )}
            </>
          )}
        </div>
        <div className="card">
          <div className="card-header"><div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Most-Flagged Muscles</h2>
            <span className="card-sub">Athletes flagged per muscle (weak = myodynamia · tight = tension)</span>
          </div></div>
          {cohort && cohort.topMyodynamia.length + cohort.topTension.length === 0 ? (
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>No muscle flags on record for this cohort.</div>
          ) : (
            <div style={{ position: 'relative', height: 300 }}><canvas ref={muscleRef} /></div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
