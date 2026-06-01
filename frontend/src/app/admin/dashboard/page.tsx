'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Legend, Tooltip, Title,
} from 'chart.js';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Legend, Tooltip, Title,
);

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
  byMonth: MonthBucket[];
}

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'];
const GENDERS = ['Male', 'Female'];

// Age groups for Dr Thung's "by age group" filter ask.
const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

// Body region groupings — chip shortcuts so admin can slice by region quickly
// instead of cycling through the 10-option body part dropdown.
const BODY_REGIONS: Record<string, string[]> = {
  'Upper body': ['Neck', 'Shoulder', 'Elbow', 'Wrist'],
  'Trunk': ['Spine', 'Lumbar/Pelvis'],
  'Lower body': ['Hip', 'Knee', 'Ankle'],
};

function regionOfBodyPart(bp: string): string | null {
  for (const [region, parts] of Object.entries(BODY_REGIONS)) {
    if (parts.includes(bp)) return region;
  }
  return null;
}

const NAVY = '#0f2c4a';
const GOLD = '#c89b3c';

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
  const [bodyRegion, setBodyRegion] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Trend chart bucketing — Dr Thung asked for both monthly (default) and
  // quarterly views to spot Q-to-Q seasonality (e.g. "Q4 high knee risk").
  const [trendBucket, setTrendBucket] = useState<'monthly' | 'quarterly'>('monthly');

  // Refs for the chart canvases
  const bodyPartRef = useRef<HTMLCanvasElement | null>(null);
  const typeRef = useRef<HTMLCanvasElement | null>(null);
  const monthRef = useRef<HTMLCanvasElement | null>(null);
  const chartsRef = useRef<Chart[]>([]);

  async function fetchSummary() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (sport) params.set('sport', sport);
      if (gender) params.set('gender', gender);
      if (programme) params.set('program', programme);
      if (bodyPart) params.set('bodyPart', bodyPart);
      if (injuryType) params.set('injuryType', injuryType);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const ageGroup = AGE_GROUPS[ageGroupIndex];
      if (ageGroup.min !== undefined) params.set('ageMin', String(ageGroup.min));
      if (ageGroup.max !== undefined) params.set('ageMax', String(ageGroup.max));
      const qs = params.toString();
      const data = await api.get<AnalyticsSummary>(
        `/injuries/analytics/summary${qs ? `?${qs}` : ''}`,
      );
      // When a body region chip is active without a specific bodyPart, filter
      // distribution buckets client-side so the rest of the summary still
      // reflects the full picture but the body-part chart shows only the
      // region.
      const filteredSummary = bodyRegion && !bodyPart
        ? {
            ...data,
            byBodyPart: data.byBodyPart.filter((b) => BODY_REGIONS[bodyRegion].includes(b._id)),
          }
        : data;
      setSummary(filteredSummary);
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
  }, [sport, gender, programme, bodyPart, injuryType, ageGroupIndex, bodyRegion, startDate, endDate]);

  // Selecting a specific bodyPart wins over a region chip — clear region.
  useEffect(() => {
    if (bodyPart) setBodyRegion(null);
  }, [bodyPart]);

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

  // Render the charts
  useEffect(() => {
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];
    if (!summary) return;

    // By body part — ordered to match BODY_PARTS list
    const bpData = BODY_PARTS.map((b) => summary.byBodyPart.find((x) => x._id === b)?.count ?? 0);
    if (bodyPartRef.current) {
      const ctx = bodyPartRef.current.getContext('2d');
      if (ctx) {
        chartsRef.current.push(new Chart(ctx, {
          type: 'bar',
          data: { labels: BODY_PARTS, datasets: [{ label: 'Cases', data: bpData, backgroundColor: NAVY, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
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
          data: { labels: INJURY_TYPES, datasets: [{ label: 'Cases', data: itData, backgroundColor: GOLD, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
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
              borderColor: NAVY,
              backgroundColor: 'rgba(15,44,74,0.1)',
              tension: 0.3,
              // Highlight the peak point in gold so the "critical time" is
              // visible at a glance, not just buried in the line shape.
              pointBackgroundColor: trend.values.map((_, i) => (trend.peak && trend.labels[i] === trend.peak.label ? GOLD : NAVY)),
              pointRadius: trend.values.map((_, i) => (trend.peak && trend.labels[i] === trend.peak.label ? 6 : 4)),
            }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        }));
      }
    }

    return () => {
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [summary, trend]);

  function reset() {
    setSport(''); setGender(''); setProgramme('');
    setBodyPart(''); setInjuryType('');
    setAgeGroupIndex(0); setBodyRegion(null);
    setStartDate(''); setEndDate('');
  }

  const programmes = ['PODIUM', 'PELAPIS', 'OTHERS'];

  return (
    <DashboardLayout allowedRoles={['admin']} title="Injury Analytics">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        {/* Body region chip shortcuts — quick slicer above the dropdowns */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Body region
          </span>
          <button
            type="button"
            className={`region-chip${!bodyRegion ? ' active' : ''}`}
            onClick={() => setBodyRegion(null)}
          >
            All
          </button>
          {Object.keys(BODY_REGIONS).map((r) => (
            <button
              key={r}
              type="button"
              className={`region-chip${bodyRegion === r ? ' active' : ''}`}
              onClick={() => setBodyRegion(bodyRegion === r ? null : r)}
              disabled={!!bodyPart && regionOfBodyPart(bodyPart) !== r}
              title={!!bodyPart && regionOfBodyPart(bodyPart) !== r
                ? 'Clear the Body Part filter to use a region shortcut'
                : ''}
            >
              {r}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
              {programmes.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
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
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Age Group</label>
            <select value={ageGroupIndex} onChange={(e) => setAgeGroupIndex(Number(e.target.value))}>
              {AGE_GROUPS.map((g, i) => (<option key={g.label} value={i}>{g.label}</option>))}
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
          <button type="button" className="btn btn-outline btn-sm" onClick={reset}>Reset</button>
          <Link href="/admin/reports" className="btn btn-gold btn-sm">Generate PDF Report</Link>
        </div>
      </div>

      <div className="stat-grid">
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

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Body Part</h2>
              <span className="card-sub">All filtered records</span>
            </div>
          </div>
          <div style={{ position: 'relative', height: 280 }}>
            <canvas ref={bodyPartRef} />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Injuries by Type</h2>
              <span className="card-sub">All filtered records</span>
            </div>
          </div>
          <div style={{ position: 'relative', height: 280 }}>
            <canvas ref={typeRef} />
          </div>
        </div>
      </div>

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
    </DashboardLayout>
  );
}
