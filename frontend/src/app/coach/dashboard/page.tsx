'use client';

// Coach · Squad Readiness (first-class 4th role, FYP II). Read-only view of the
// athletes in the coach's ONE assigned sport, bucketed into Full-Go /
// Observation / Restricted straight from each athlete's cohort-normed
// HoloMotion band — the same indicator the athlete and medical views report, so
// all three roles quote one number. Readiness was previously derived from the
// composite training-load model (lib/risk.ts); that was removed from the
// dashboards on 2026-07-16 (see docs/fyp/ACWR_REBUILD.md). The backend
// (routes/coach.js) supplies each athlete's profile + flags + active injuries +
// indicator + events. Selecting an athlete opens a read-only detail view (the
// same screening surfaces medical sees, minus the clinical affordances).

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { MuscleEntry } from '@/lib/risk';
import { computeBodyPartAlerts, AthleteRisks } from '@/lib/screeningAlerts';
import { getInitials } from '@/lib/name';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';

// Heavy client-only visuals — split out so the roster shell paints first.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });

interface ReadinessRow {
  athleteId: string;
  name: string;
  sport: string;
  program?: string;
  gender?: string | null;
  age?: number | null;
  disciplines: string[];
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  activeInjuries: Array<{ recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic' }>;
  screening?: (ScreeningIndicator & { prevIndicator?: number | null; prevAssessedAt?: string | null }) | null;
}

interface ReadinessResponse {
  sport: string | null;
  athletes: ReadinessRow[];
}

type Band = 'full' | 'observation' | 'restricted';

const BAND_META: Record<Band, { label: string; badge: string; color: string }> = {
  full: { label: 'Full-Go', badge: 'badge-low', color: 'var(--risk-low, #2e9e5b)' },
  observation: { label: 'Observation', badge: 'badge-moderate', color: 'var(--risk-mod, #d99a16)' },
  restricted: { label: 'Restricted', badge: 'badge-high', color: 'var(--risk-high, #d14b4b)' },
};

// spinalDiscHerniation excluded (ISN doesn't assess LDH) — mirrors the athlete
// and medical dashboards.
const RISK_KEYS: Array<keyof AthleteRisks> = [
  'neckInjuryRisk', 'shoulderInjuryRisk', 'scoliosis', 'lumbarPelvisInjury', 'jointPain', 'kneeInjuryRisk', 'ankleInjuryRisk',
];
const RISK_LABEL: Record<keyof AthleteRisks, string> = {
  neckInjuryRisk: 'Neck', shoulderInjuryRisk: 'Shoulder', scoliosis: 'Scoliosis',
  spinalDiscHerniation: 'Spinal Disc', lumbarPelvisInjury: 'Lumbar/Pelvis',
  jointPain: 'Joint Pain', kneeInjuryRisk: 'Knee', ankleInjuryRisk: 'Ankle',
};

// Map the cohort-normed HoloMotion band onto a coaching readiness band.
// green → Full-Go · amber → Observation · red → Restricted (see 2026-07-16 note
// in the file header for why this no longer derives from ACWR).
function bandFor(effectiveBand?: 'green' | 'amber' | 'red' | null): Band | null {
  if (effectiveBand === 'red') return 'restricted';
  if (effectiveBand === 'amber') return 'observation';
  if (effectiveBand === 'green') return 'full';
  return null; // no screening / cohort too small to score
}

// Change in the overall indicator since the athlete's previous screening (higher
// indicator = better). null when there's no prior screening to compare against.
function trendDelta(row: ReadinessRow): number | null {
  const s = row.screening;
  if (!s || s.overallIndicator == null || s.prevIndicator == null) return null;
  return Number(s.overallIndicator) - Number(s.prevIndicator);
}

export default function CoachDashboard() {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  // Roster filters (sport is fixed to the coach's one sport, so it isn't a filter).
  const [filterProgramme, setFilterProgramme] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');

  // Selected athlete → read-only detail view.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function downloadTeamReport() {
    if (!data?.sport) return;
    setDlBusy(true); setDlError(null);
    try {
      await api.downloadGet(`/screening-reports/team.pdf?sport=${encodeURIComponent(data.sport)}`, `AIRMS-team-${data.sport}.pdf`);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDlBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ReadinessResponse>('/coach/readiness');
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load squad readiness');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Programmes present in the squad (for the filter dropdown).
  const programmes = useMemo(() => {
    const set = new Set<string>();
    (data?.athletes ?? []).forEach((a) => { if (a.program) set.add(a.program); });
    return Array.from(set).sort();
  }, [data]);

  // Events actually on record for this squad (data-driven, so any admin-added
  // event is filterable). Empty → the event filter/column are hidden.
  const disciplineOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.athletes ?? []).forEach((a) => (a.disciplines ?? []).forEach((d) => set.add(d)));
    return Array.from(set).sort();
  }, [data]);
  const squadHasEvents = disciplineOptions.length > 0;

  // Apply filters, then classify + sort worst-first. Unscored athletes sort last.
  const classified = useMemo(() => {
    if (!data) return [];
    const ORDER: Record<Band, number> = { restricted: 0, observation: 1, full: 2 };
    return data.athletes
      .filter((a) => {
        if (filterProgramme && a.program !== filterProgramme) return false;
        if (filterGender && a.gender !== filterGender) return false;
        if (filterDiscipline && !(a.disciplines ?? []).includes(filterDiscipline)) return false;
        return true;
      })
      .map((a) => {
        const screening = computeBodyPartAlerts(a.risks, a.sport);
        const worst = screening.criticalAlerts[0] ?? screening.alerts[0] ?? null;
        return { row: a, band: bandFor(a.screening?.effectiveBand), screening, worst };
      })
      .sort((x, y) => {
        const ox = x.band ? ORDER[x.band] : 3;
        const oy = y.band ? ORDER[y.band] : 3;
        return ox - oy || (x.row.screening?.overallIndicator ?? 101) - (y.row.screening?.overallIndicator ?? 101);
      });
  }, [data, filterProgramme, filterGender, filterDiscipline]);

  const counts = useMemo(() => {
    const c = { full: 0, observation: 0, restricted: 0, unscored: 0 };
    classified.forEach((x) => { if (x.band) c[x.band]++; else c.unscored++; });
    return c;
  }, [classified]);

  // Screening coverage in the current view.
  const coverage = useMemo(
    () => ({ scored: classified.filter((x) => x.band).length, total: classified.length }),
    [classified],
  );

  // Squad momentum — change vs each athlete's previous screening (±2 = noise floor).
  const momentum = useMemo(() => {
    const m = { improving: 0, declining: 0, steady: 0 };
    classified.forEach(({ row }) => {
      const d = trendDelta(row);
      if (d === null) return;
      if (d >= 2) m.improving++;
      else if (d <= -2) m.declining++;
      else m.steady++;
    });
    return m;
  }, [classified]);

  // Common weak spots — squad-wide exercise-risk regions beyond Low (what to
  // point conditioning at). Aggregates each athlete's sport-aware region alerts.
  const weakSpots = useMemo(() => {
    const map = new Map<string, { label: string; watch: number; high: number }>();
    classified.forEach(({ screening }) => {
      if (!screening.hasData) return;
      screening.alerts.forEach((a) => {
        const e = map.get(a.label) ?? { label: a.label, watch: 0, high: 0 };
        if (a.band === 'high') e.high += 1; else e.watch += 1;
        map.set(a.label, e);
      });
    });
    return [...map.values()].sort((a, b) => (b.high - a.high) || (b.watch - a.watch)).slice(0, 6);
  }, [classified]);

  // Muscle hotspots — most-flagged muscles across the squad, counted by athlete.
  const muscleHotspots = useMemo(() => {
    const map = new Map<string, { muscle: string; kind: 'weak' | 'tight'; athletes: Set<string> }>();
    const add = (muscle: string, kind: 'weak' | 'tight', aid: string) => {
      const key = `${muscle}|${kind}`;
      const e = map.get(key) ?? { muscle, kind, athletes: new Set<string>() };
      e.athletes.add(aid);
      map.set(key, e);
    };
    classified.forEach(({ row }) => {
      (row.myodynamia ?? []).forEach((m) => add(m.muscle, 'weak', row.athleteId));
      (row.tension ?? []).forEach((m) => add(m.muscle, 'tight', row.athleteId));
    });
    return [...map.values()]
      .map((e) => ({ muscle: e.muscle, kind: e.kind, count: e.athletes.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [classified]);

  // Readiness broken down by event (an athlete counts in each of their events).
  const readinessByEvent = useMemo(() => {
    const map = new Map<string, { discipline: string; full: number; observation: number; restricted: number; unscored: number }>();
    classified.forEach(({ row, band }) => {
      (row.disciplines ?? []).forEach((d) => {
        const e = map.get(d) ?? { discipline: d, full: 0, observation: 0, restricted: 0, unscored: 0 };
        if (band) e[band] += 1; else e.unscored += 1;
        map.set(d, e);
      });
    });
    return [...map.values()].sort((a, b) => a.discipline.localeCompare(b.discipline));
  }, [classified]);

  // Athletes to flag to the medical team — Restricted or carrying active injuries.
  const attention = useMemo(
    () => classified
      .filter(({ band, row }) => band === 'restricted' || row.activeInjuries.length > 0)
      .map(({ row, band, worst }) => {
        const factor = (row.screening?.factors ?? []).find((f) => f.includes('over threshold'));
        const reason = factor ?? (worst ? `${worst.label} ${worst.value.toFixed(0)}` : null);
        return { row, band, reason, injuries: row.activeInjuries.length };
      }),
    [classified],
  );

  const total = classified.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const selected = useMemo(
    () => (selectedId ? data?.athletes.find((a) => a.athleteId === selectedId) ?? null : null),
    [selectedId, data],
  );

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selected) {
    const screeningData = {
      name: selected.name,
      sport: selected.sport,
      age: selected.age ?? undefined,
      gender: selected.gender ?? undefined,
      overallActivityScore: selected.overallActivityScore,
      injuryRiskIndex: selected.injuryRiskIndex,
      mobility: selected.mobility,
      stability: selected.stability,
      symmetry: selected.symmetry,
      risks: selected.risks,
    };
    // The readiness endpoint already excludes recovered injuries, so every row
    // here is active.
    const activeInjuries = selected.activeInjuries ?? [];
    return (
      <DashboardLayout allowedRoles={['coach']} title="Squad Readiness">
        <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelectedId(null)}>
          ← Back to squad
        </button>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--brand-navy)', color: 'white', display: 'grid', placeItems: 'center', fontSize: '1.3rem', fontWeight: 600 }}>
              {getInitials(selected.name)}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ margin: 0 }}>{selected.name}</h2>
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                {selected.athleteId} · {selected.sport} · {selected.program ?? '—'} · {selected.age ? `${selected.age}y` : '—'} · {selected.gender ?? '—'}
              </div>
              {selected.disciplines.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {selected.disciplines.map((d) => (<span key={d} className="badge-low">{d}</span>))}
                </div>
              )}
            </div>
          </div>
        </div>

        <OverallRiskBadge screening={selected.screening} hero />
        <ScreeningAlertBanner
          risks={selected.risks}
          sport={selected.sport}
          band={selected.screening?.effectiveBand}
          audience="staff"
        />

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
              <span className="card-sub">Latest screening · closer to the centre is better</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
              <RiskRadar
                labels={RISK_KEYS.map((k) => RISK_LABEL[k])}
                values={RISK_KEYS.map((k) => Math.min(30, Math.max(0, selected.risks[k] ?? 0)))}
              />
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Each spoke is one exercise-risk indicator from {selected.name.split(' ')[0]}&apos;s latest HoloMotion
                screening, on a 0–30 scale.
              </p>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>
                Read-only. Clinical decisions and band overrides remain with medical staff.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <ScreeningPanel athlete={screeningData} />
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
              <span className="card-sub">Latest screening · L = left, R = right, B = both</span>
            </div>
            <span className="text-muted" style={{ fontSize: '0.82rem' }}>
              {activeInjuries.length} active injur{activeInjuries.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
          <BodyMap myodynamia={selected.myodynamia ?? []} tension={selected.tension ?? []} />
        </div>
      </DashboardLayout>
    );
  }

  // ── Roster view ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout allowedRoles={['coach']} title="Squad Readiness">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {dlError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{dlError}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Squad Readiness Overview</h2>
            <span className="card-sub">
              {data?.sport ? `Sport: ${data.sport}` : 'No sport assigned to your account yet'}
              {' · '}read-only · readiness from each athlete&apos;s cohort-normed HoloMotion indicator — the same band the medical team sees
            </span>
          </div>
          {data?.sport && (
            <button type="button" className="btn btn-primary btn-sm" onClick={downloadTeamReport} disabled={dlBusy} style={{ flexShrink: 0 }}>
              {dlBusy ? 'Preparing…' : 'Download team report'}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-muted">Loading squad…</p>
        ) : !data?.sport ? (
          <div className="empty-state">
            No sport assigned to your account. An administrator assigns your sport.
          </div>
        ) : (
          <>
            {/* Filters — programme, gender, and (for sports that have them) event */}
            <div className="medical-rail-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <select value={filterProgramme} onChange={(e) => setFilterProgramme(e.target.value)} aria-label="Filter by programme">
                <option value="">All Programmes</option>
                {programmes.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} aria-label="Filter by gender">
                <option value="">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
              {squadHasEvents && (
                <select value={filterDiscipline} onChange={(e) => setFilterDiscipline(e.target.value)} aria-label="Filter by event">
                  <option value="">All Events</option>
                  {disciplineOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              )}
              {(filterProgramme || filterGender || filterDiscipline) && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFilterProgramme(''); setFilterGender(''); setFilterDiscipline(''); }}>
                  Clear filters
                </button>
              )}
            </div>

            {total === 0 ? (
              <div className="empty-state">
                {filterProgramme || filterGender || filterDiscipline
                  ? 'No athletes match the current filters.'
                  : 'No athletes in your squad yet.'}
              </div>
            ) : (
              <>
                <div className="stat-grid" style={{ marginBottom: 8 }}>
                  {(['full', 'observation', 'restricted'] as Band[]).map((b) => (
                    <div className="stat-tile" key={b} style={{ borderTop: `3px solid ${BAND_META[b].color}` }}>
                      <div className="stat-tile-label">{BAND_META[b].label}</div>
                      <div className="stat-tile-value">{pct(counts[b])}%</div>
                      <div className="stat-tile-delta">
                        {counts[b]} athlete{counts[b] === 1 ? '' : 's'}
                        {b === 'full' ? ' · cleared' : b === 'observation' ? ' · modified load' : ' · clinical priority'}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 6 }}>
                  {(['full', 'observation', 'restricted'] as Band[]).map((b) =>
                    counts[b] > 0 ? (
                      <div key={b} style={{ width: `${pct(counts[b])}%`, background: BAND_META[b].color }} title={`${BAND_META[b].label}: ${counts[b]}`} />
                    ) : null,
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Needs attention — the athletes to flag to the medical team */}
      {attention.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--risk-high, #d14b4b)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Needs attention ({attention.length})</h2>
              <span className="card-sub">Restricted athletes and anyone carrying an active injury — the ones to raise with the medical team.</span>
            </div>
          </div>
          <div>
            {attention.map(({ row, band, reason, injuries }) => (
              <button key={row.athleteId} type="button" className="athlete-row" onClick={() => setSelectedId(row.athleteId)} style={{ width: '100%' }}>
                <span className="athlete-row-avatar">{getInitials(row.name)}</span>
                <span className="athlete-row-info">
                  <span className="athlete-row-name">
                    {row.name}
                    {band && <span className={BAND_META[band].badge} style={{ marginLeft: 8 }}>{BAND_META[band].label}</span>}
                  </span>
                  <span className="athlete-row-meta">
                    {reason ?? 'flagged'}{injuries ? ` · ${injuries} active injur${injuries === 1 ? 'y' : 'ies'}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Squad focus — where to point conditioning + squad momentum */}
      {total > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Squad focus</h2>
              <span className="card-sub">
                {coverage.scored}/{coverage.total} screened · momentum since last screening:{' '}
                <strong style={{ color: 'var(--risk-low)' }}>{momentum.improving} ↑</strong> improving ·{' '}
                <strong style={{ color: 'var(--risk-high)' }}>{momentum.declining} ↓</strong> declining · {momentum.steady} steady
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            <div>
              <strong style={{ fontSize: '0.82rem' }}>Common weak spots</strong>
              {weakSpots.length === 0 ? (
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>No exercise-risk regions beyond Low.</div>
              ) : (
                <ul className="insight-list" style={{ marginTop: 8 }}>
                  {weakSpots.map((w) => (
                    <li key={w.label}>
                      <strong>{w.label}</strong>{' '}
                      {w.high > 0 && <span className="badge-high" style={{ marginRight: 4 }}>{w.high} elevated</span>}
                      {w.watch > 0 && <span className="badge-moderate">{w.watch} watch</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <strong style={{ fontSize: '0.82rem' }}>Muscle hotspots</strong>
              {muscleHotspots.length === 0 ? (
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>No muscle flags on record.</div>
              ) : (
                <ul className="insight-list" style={{ marginTop: 8 }}>
                  {muscleHotspots.map((m) => (
                    <li key={`${m.muscle}-${m.kind}`}>
                      <strong>{m.muscle}</strong>{' '}
                      <span className={m.kind === 'weak' ? 'badge-moderate' : 'badge-low'}>{m.kind}</span>{' '}
                      <span className="text-muted">×{m.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {squadHasEvents && (
              <div>
                <strong style={{ fontSize: '0.82rem' }}>Readiness by event</strong>
                <ul className="insight-list" style={{ marginTop: 8 }}>
                  {readinessByEvent.map((e) => {
                    const parts = [
                      e.full > 0 ? <span key="f" style={{ color: 'var(--risk-low)' }}>{e.full} full</span> : null,
                      e.observation > 0 ? <span key="o" style={{ color: 'var(--risk-mod)' }}>{e.observation} obs</span> : null,
                      e.restricted > 0 ? <span key="r" style={{ color: 'var(--risk-high)' }}>{e.restricted} restricted</span> : null,
                      e.unscored > 0 ? <span key="u" className="text-muted">{e.unscored} n/a</span> : null,
                    ].filter(Boolean);
                    return (
                      <li key={e.discipline}>
                        <strong>{e.discipline}</strong>{' '}
                        <span style={{ fontSize: '0.78rem' }}>
                          {parts.map((p, i) => (<span key={i}>{i > 0 ? ' · ' : ''}{p}</span>))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Athletes</h2>
              <span className="card-sub">Sorted by priority · highest concern first · select an athlete to view their screening</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Athlete</th>
                  {squadHasEvents && <th>Events</th>}
                  <th style={{ textAlign: 'center' }}>HoloMotion Risk</th>
                  <th style={{ textAlign: 'center' }}>Trend</th>
                  <th style={{ textAlign: 'center' }}>Readiness</th>
                  <th style={{ textAlign: 'center' }}>Screening</th>
                  <th style={{ textAlign: 'center' }}>Active injuries</th>
                </tr>
              </thead>
              <tbody>
                {classified.map(({ row, band, screening, worst }) => (
                  <tr
                    key={row.athleteId}
                    onClick={() => setSelectedId(row.athleteId)}
                    style={{ cursor: 'pointer' }}
                    title="View screening detail"
                  >
                    <td>
                      <strong>{row.name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.78rem' }}>{row.athleteId} · {row.program ?? '—'} · {row.gender ?? '—'}</div>
                    </td>
                    {squadHasEvents && (
                      <td style={{ fontSize: '0.8rem' }}>
                        {row.disciplines.length ? row.disciplines.join(', ') : <span className="text-muted">—</span>}
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      <OverallRiskBadge screening={row.screening} compact />
                    </td>
                    <td style={{ textAlign: 'center' }} title={row.screening?.prevAssessedAt ? `vs ${new Date(row.screening.prevAssessedAt).toISOString().slice(0, 10)}` : 'No earlier screening to compare'}>
                      {(() => {
                        const d = trendDelta(row);
                        if (d === null) return <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>;
                        if (d >= 2) return <span style={{ color: 'var(--risk-low)', fontWeight: 600 }}>↑ +{d}</span>;
                        if (d <= -2) return <span style={{ color: 'var(--risk-high)', fontWeight: 600 }}>↓ {d}</span>;
                        return <span className="text-muted" style={{ fontSize: '0.78rem' }}>steady</span>;
                      })()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {band
                        ? <span className={BAND_META[band].badge}>{BAND_META[band].label}</span>
                        : <span className="text-muted" style={{ fontSize: '0.78rem' }}>Not scored</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!screening.hasData ? (
                        <span className="text-muted" title="No HoloMotion screening ingested for this athlete yet">no data</span>
                      ) : worst ? (
                        <span
                          className={worst.band === 'high' ? 'badge-high' : 'badge-moderate'}
                          title={screening.alerts.map((a) => `${a.label} ${a.value.toFixed(0)}`).join(' · ')}
                        >
                          {worst.label} {worst.value.toFixed(0)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.activeInjuries.length || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 12, marginBottom: 0 }}>
            Readiness is informational. Clinical decisions and overrides remain with medical staff.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
