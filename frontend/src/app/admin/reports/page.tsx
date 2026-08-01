'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

const REPORT_TYPES = [
  { value: 'monthly', label: 'Monthly Standard Report' },
  { value: 'quarterly', label: 'Quarterly Programme Review' },
  { value: 'custom', label: 'Custom Filtered Report' },
];

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'];

const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function startOfQuarterISO() {
  const d = new Date();
  const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
  d.setMonth(quarterStartMonth, 1);
  return d.toISOString().slice(0, 10);
}

// The page export wraps the form in a Suspense boundary so that
// useSearchParams (used inside ReportBuilder) doesn't trip the App Router's
// "should be wrapped in suspense" build-time check.
export default function AdminReportsPage() {
  return (
    <Suspense fallback={<DashboardLayout allowedRoles={['admin']} title="PDF Reports"><div className="card">Loading report builder…</div></DashboardLayout>}>
      <ReportBuilder />
    </Suspense>
  );
}

interface RosterAthlete { athleteId: string; name: string; sport?: string; }

// HoloMotion screening reports — holistic (cohort), individual (by NAME, which
// resolves to the athlete ID no one remembers), and team (by
// sport/programme/gender). Streamed PDFs.
function ScreeningReportsCard() {
  const [roster, setRoster] = useState<RosterAthlete[]>([]);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [sport, setSport] = useState('Badminton');
  const [programme, setProgramme] = useState('');
  const [gender, setGender] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<RosterAthlete[]>('/athletes');
        if (!cancelled) setRoster(rows.map((a) => ({ athleteId: a.athleteId, name: a.name, sport: a.sport })));
      } catch { /* the ID can still be typed directly */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve the typed value to an athlete ID: an explicit ATHxxxx wins, else an
  // exact name match, else a unique case-insensitive prefix match.
  const resolveAthleteId = (q: string): string => {
    const raw = q.trim();
    const m = raw.match(/ATH\d+/i);
    if (m) return m[0].toUpperCase();
    const lower = raw.toLowerCase();
    const exact = roster.find((a) => a.name.toLowerCase() === lower);
    if (exact) return exact.athleteId;
    const hits = roster.filter((a) => a.name.toLowerCase().startsWith(lower));
    return hits.length === 1 ? hits[0].athleteId : '';
  };
  const resolvedId = resolveAthleteId(athleteQuery);

  async function dl(kind: string, path: string, filename: string) {
    setBusy(kind); setErr(null);
    try { await api.downloadGet(path, filename); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(''); }
  }

  return (
    <div className="card">
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>HoloMotion Screening Reports</h2>
        <span className="card-sub">Cohort-normed PDF reports</span>
      </div></div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="grid-3" style={{ gap: 16 }}>
        <div>
          <strong style={{ fontSize: '0.85rem' }}>Holistic (all athletes)</strong>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 8px' }}>Cohort-wide risk distribution, averages, and flagged athletes.</p>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => dl('h', '/screening-reports/holistic.pdf', 'AIRMS-holistic.pdf')}>{busy === 'h' ? '…' : 'Download'}</button>
        </div>
        <div>
          <strong style={{ fontSize: '0.85rem' }}>Individual</strong>
          <div className="form-group" style={{ margin: '4px 0' }}>
            <input value={athleteQuery} onChange={(e) => setAthleteQuery(e.target.value)} placeholder="Search by name…" list="report-athlete-roster" aria-label="Athlete name" />
            <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2, minHeight: 14 }}>
              {athleteQuery.trim() ? (resolvedId ? `→ ${resolvedId}` : 'No unique match yet') : 'Type a name (or an ATH id)'}
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== '' || !resolvedId} onClick={() => dl('i', `/screening-reports/individual/${resolvedId}.pdf`, `AIRMS-${resolvedId}.pdf`)}>{busy === 'i' ? '…' : 'Download'}</button>
        </div>
        <div>
          <strong style={{ fontSize: '0.85rem' }}>Team / group</strong>
          <div style={{ display: 'flex', gap: 6, margin: '4px 0', flexWrap: 'wrap' }}>
            <input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Sport" style={{ flex: '1 1 100px' }} />
            <select value={programme} onChange={(e) => setProgramme(e.target.value)}><option value="">Any prog</option><option>PODIUM</option><option>PELAPIS</option><option>OTHERS</option></select>
            <select value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Any gender</option><option>Male</option><option>Female</option></select>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== '' || !sport.trim()} onClick={() => {
            const q = new URLSearchParams({ sport: sport.trim(), ...(programme ? { programme } : {}), ...(gender ? { gender } : {}) });
            dl('t', `/screening-reports/team.pdf?${q}`, 'AIRMS-team.pdf');
          }}>{busy === 't' ? '…' : 'Download'}</button>
        </div>
      </div>
      <datalist id="report-athlete-roster">
        {roster.map((a) => (<option key={a.athleteId} value={a.name}>{a.athleteId}{a.sport ? ` · ${a.sport}` : ''}</option>))}
      </datalist>
    </div>
  );
}

function ReportBuilder() {
  // Reads incoming filter state from the admin dashboard's "Generate PDF
  // Report" link. If any of these query params are present, the form
  // pre-fills with them so the analyst doesn't re-enter what they already
  // chose on the dashboard.
  const searchParams = useSearchParams();
  const getParam = (k: string) => searchParams?.get(k) || '';
  const hasPeriodInUrl = !!(getParam('startDate') || getParam('endDate'));

  // If the URL carries a date range, default to 'custom' so the
  // reportType-change effect below doesn't overwrite the incoming dates.
  const [reportType, setReportType] = useState(() => (hasPeriodInUrl ? 'custom' : 'monthly'));
  const [periodStart, setPeriodStart] = useState(() => getParam('startDate') || startOfMonthISO());
  const [periodEnd, setPeriodEnd] = useState(() => getParam('endDate') || todayISO());
  const [filterSport, setFilterSport] = useState(() => getParam('sport'));
  const [filterProgramme, setFilterProgramme] = useState(() => getParam('program'));
  const [filterGender, setFilterGender] = useState(() => getParam('gender'));
  const [filterBodyPart, setFilterBodyPart] = useState(() => getParam('bodyPart'));
  const [filterInjuryType, setFilterInjuryType] = useState(() => getParam('injuryType'));
  const [ageGroupIndex, setAgeGroupIndex] = useState(() => {
    const n = Number(getParam('ageGroupIndex'));
    return Number.isFinite(n) && n >= 0 && n < AGE_GROUPS.length ? n : 0;
  });
  const [includeRecovery, setIncludeRecovery] = useState(true);
  const [includeTrends, setIncludeTrends] = useState(true);
  const [includeAthleteIndex, setIncludeAthleteIndex] = useState(true);

  const [sports, setSports] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null);

  // Adjust default period when report type changes. Skip the first render
  // so URL-prefilled period dates don't get clobbered on mount.
  const reportTypeHydrated = useRef(false);
  useEffect(() => {
    if (!reportTypeHydrated.current) {
      reportTypeHydrated.current = true;
      return;
    }
    if (reportType === 'monthly') {
      setPeriodStart(startOfMonthISO());
      setPeriodEnd(todayISO());
    } else if (reportType === 'quarterly') {
      setPeriodStart(startOfQuarterISO());
      setPeriodEnd(todayISO());
    }
    // 'custom' leaves whatever the user set
  }, [reportType]);

  // Load sports list for filter dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<string[]>('/athletes/meta/sports');
        if (!cancelled) setSports(s);
      } catch { /* swallow — input still works without */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const ageGroup = AGE_GROUPS[ageGroupIndex];
      const body: Record<string, unknown> = {
        reportType,
        includeRecovery,
        includeTrends,
        includeAthleteIndex,
      };
      if (periodStart)         body.startDate = periodStart;
      if (periodEnd)           body.endDate   = periodEnd;
      if (filterSport)         body.sport     = filterSport;
      if (filterProgramme)     body.program   = filterProgramme;
      if (filterGender)        body.gender    = filterGender;
      if (filterBodyPart)      body.bodyPart  = filterBodyPart;
      if (filterInjuryType)    body.injuryType = filterInjuryType;
      if (ageGroup.min !== undefined) body.ageMin = ageGroup.min;
      if (ageGroup.max !== undefined) body.ageMax = ageGroup.max;

      const res = await api.downloadPost('/reports/injuries-pdf', body);
      const blob = await res.blob();

      // Derive filename from Content-Disposition if the server set one,
      // otherwise fall back to a sensible default.
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || `airms-${reportType}-${todayISO()}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLastDownloaded(filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  function filterSummary(): string {
    const parts: string[] = [];
    if (filterSport)      parts.push(`Sport: ${filterSport}`);
    if (filterProgramme)  parts.push(`Programme: ${filterProgramme}`);
    if (filterGender)     parts.push(`Gender: ${filterGender}`);
    if (filterBodyPart)   parts.push(`Body Part: ${filterBodyPart}`);
    if (filterInjuryType) parts.push(`Injury Type: ${filterInjuryType}`);
    if (ageGroupIndex !== 0) parts.push(`Age: ${AGE_GROUPS[ageGroupIndex].label}`);
    if (periodStart || periodEnd) parts.push(`Period: ${periodStart || '…'} → ${periodEnd || '…'}`);
    return parts.length ? parts.join(' · ') : 'All records (no filters)';
  }

  return (
    <DashboardLayout allowedRoles={['admin']} title="PDF Reports">
      <ScreeningReportsCard />
      <div style={{ height: 20 }} />
      <div className="grid-1-2">
        <div className="card">
          <h2 className="card-title">Injury Report Builder</h2>
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleGenerate}>
            <div className="form-group">
              <label htmlFor="r-type">Report Type</label>
              <select id="r-type" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {REPORT_TYPES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="r-from">Period start</label>
                <input id="r-from" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="r-to">Period end</label>
                <input id="r-to" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="r-sport">Sport filter</label>
                <select id="r-sport" value={filterSport} onChange={(e) => setFilterSport(e.target.value)}>
                  <option value="">All</option>
                  {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="r-prog">Programme</label>
                <select id="r-prog" value={filterProgramme} onChange={(e) => setFilterProgramme(e.target.value)}>
                  <option value="">All</option>
                  <option>PODIUM</option>
                  <option>PELAPIS</option>
                  <option>OTHERS</option>
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="r-gender">Gender</label>
                <select id="r-gender" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                  <option value="">All</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="r-age">Age group</label>
                <select id="r-age" value={ageGroupIndex} onChange={(e) => setAgeGroupIndex(Number(e.target.value))}>
                  {AGE_GROUPS.map((g, i) => (<option key={g.label} value={i}>{g.label}</option>))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="r-bp">Body Part</label>
                <select id="r-bp" value={filterBodyPart} onChange={(e) => setFilterBodyPart(e.target.value)}>
                  <option value="">All</option>
                  {BODY_PARTS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="r-it">Injury Type</label>
                <select id="r-it" value={filterInjuryType} onChange={(e) => setFilterInjuryType(e.target.value)}>
                  <option value="">All</option>
                  {INJURY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={includeRecovery} onChange={(e) => setIncludeRecovery(e.target.checked)} />
                Include severity + recovery status breakdown
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 4 }}>
                <input type="checkbox" checked={includeTrends} onChange={(e) => setIncludeTrends(e.target.checked)} />
                Include monthly trend chart
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 4 }}>
                <input type="checkbox" checked={includeAthleteIndex} onChange={(e) => setIncludeAthleteIndex(e.target.checked)} />
                Include athlete index (unique athletes affected)
              </label>
            </div>

            <button type="submit" className="btn btn-gold btn-full" disabled={generating}>
              {generating ? 'Generating PDF…' : 'Generate & download PDF'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Report preview</h2>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            <strong>Live generation.</strong> Clicking <em>Generate</em> queries the live injury
            database against the filters below and streams a fresh PDF straight to your browser.
            No data is cached or pre-rendered.
          </div>

          <h3 style={{ margin: '4px 0 8px', fontSize: '0.92rem' }}>Filters that will be applied</h3>
          <div className="injury-record-notes" style={{
            background: 'var(--bg)',
            padding: 12,
            borderRadius: 6,
            fontSize: '0.85rem',
            marginBottom: 18,
          }}>
            {filterSummary()}
          </div>

          <h3 style={{ margin: '4px 0 8px', fontSize: '0.92rem' }}>Sections in the generated PDF</h3>
          <ul style={{ lineHeight: 1.8, paddingLeft: 20, fontSize: '0.9rem' }}>
            <li><strong>Cover</strong> — title, AIRMS branding, period, generated-on timestamp</li>
            <li><strong>Executive summary</strong> — total cases, athletes affected, sports affected, currently recovering</li>
            <li><strong>Distribution by body part</strong> — horizontal bar chart, ordered canonically</li>
            <li><strong>Distribution by injury type</strong> — horizontal bar chart</li>
            {includeRecovery && (
              <>
                <li><strong>Distribution by severity</strong> — Minor / Moderate / Severe</li>
                <li><strong>Recovery status</strong> — Recovering / Recovered / Chronic</li>
              </>
            )}
            {includeTrends && (
              <li><strong>Cases over time</strong> — monthly breakdown within the selected period</li>
            )}
            {includeAthleteIndex && (
              <li><strong>Athlete index</strong> — unique athletes affected, with their injury count</li>
            )}
            <li><strong>Appendix</strong> — filter context + data source + report version</li>
          </ul>

          {lastDownloaded && (
            <div className="alert alert-success" style={{ marginTop: 14 }}>
              <strong>Download complete.</strong> Saved as <code>{lastDownloaded}</code>.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
