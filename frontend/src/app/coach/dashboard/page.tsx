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
import { computeBodyPartAlerts, AthleteRisks, BodyRegion, RADAR_LABELS, highThresholdsFor, riskRadarSeries } from '@/lib/screeningAlerts';
import { getInitials } from '@/lib/name';
import { readinessBreakdown, bandFor, type ReadinessBand } from '@/lib/readiness';
// The RISK band vocabulary, kept apart from this file's READINESS bands below
// (Full-Go / Observation / Restricted), which are a different thing wearing the
// same three colours.
import {
  BANDS as RISK_BANDS, BAND_COLOR as BAND_RISK_COLOR, BAND_GLYPH, BAND_SHORT,
  type Band as RiskBand,
} from '@/lib/bands';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningHistory from '@/components/dashboard/ScreeningHistory';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import ScreeningDatePicker, { FullScreening } from '@/components/dashboard/ScreeningDatePicker';

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
  screening?: (ScreeningIndicator & { prevIndicator?: number | null; prevAssessedAt?: string | null }) | null;
}

interface ReadinessResponse {
  sport: string | null;
  athletes: ReadinessRow[];
  // The threshold above which a move between screenings counts as real, derived
  // by the backend over the whole roster (routes/coach.js). Optional so an older
  // payload still renders; DEFAULT_DEAD_BAND below is the documented fallback.
  deadBand?: number;
  deadBandDerived?: boolean;
}

// Only used when the payload carries no dead band at all. It matches
// utils/reliability.js's FALLBACK_DEAD_BAND, which is what the server sends
// while the repeat screenings are too few to earn a real one.
const DEFAULT_DEAD_BAND = 2;

// Band vocabulary, the green/amber/red mapping and the readiness arithmetic all
// live in lib/readiness.ts, where they are tested. Keeping a second copy here is
// how the 88% denominator bug survived unnoticed in the first place.
type Band = ReadinessBand;

const BAND_META: Record<Band, { label: string; badge: string; color: string }> = {
  full: { label: 'Full-Go', badge: 'badge-low', color: 'var(--risk-low)' },
  observation: { label: 'Observation', badge: 'badge-moderate', color: 'var(--risk-moderate)' },
  restricted: { label: 'Restricted', badge: 'badge-high', color: 'var(--risk-high)' },
};

// Display name per body region for the coaching-suggestion card (the alert
// layer groups the 8 indicators into these regions; see screeningAlerts.ts).
const REGION_LABEL: Record<BodyRegion, string> = {
  Neck: 'Neck', Shoulder: 'Shoulder', Spine: 'Spine (scoliosis)',
  'Lumbar/Pelvis': 'Lumbar / pelvis', Joint: 'Joint pain', Knee: 'Knee', Ankle: 'Ankle',
};

// The training-load adjustment to make when a region is the squad's shared weak
// spot. Deliberately programme-side levers (volume, movement prep, conditioning)
// — the coach is read-only on the clinical side, so these are load decisions
// within their remit, NOT treatment. The card says as much. Region→movement
// rationale mirrors the sport-critical mapping in screeningAlerts.ts.
const REGION_ADJUSTMENT: Record<BodyRegion, string> = {
  Knee: 'Trim plyometric and hard-landing volume this microcycle; add posterior-chain and single-leg stability work (Nordic curls, step-downs) and check landing mechanics.',
  Ankle: 'Ease change-of-direction and high-impact volume; add balance / proprioception drills and calf-complex loading; review footwear and taping.',
  Shoulder: 'Pull back overhead and throwing volume; add rotator-cuff and scapular-control work; screen overhead mobility before loading.',
  Neck: 'Break up sustained end-range neck positions; add neck / upper-trap conditioning and posture resets between efforts.',
  Spine: 'Balance left/right loading; add anti-rotation core and thoracic mobility; hold off on heavy asymmetric lifting until reviewed.',
  'Lumbar/Pelvis': 'Cut heavy axial-loading and end-range flexion volume; add hip / core stability and hinge-pattern strength.',
  Joint: 'Watch overall training density; swap in low-impact conditioning and keep an eye on session RPE.',
};

// Map the cohort-normed HoloMotion band onto a coaching readiness band.
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

  // Selected athlete → read-only detail view. `picked` is a PAST screening the
  // coach chose to view (null = the athlete's latest/live data).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<FullScreening | null>(null);

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

  // Individual screening PDF — the same report medical/admin pull; the backend
  // scopes coaches to athletes in their assigned sport.
  async function downloadIndividualReport(athleteId: string) {
    setDlBusy(true); setDlError(null);
    try {
      await api.downloadGet(`/screening-reports/individual/${athleteId}.pdf`, `AIRMS-${athleteId}.pdf`);
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

  // Opening (or leaving) an athlete's detail is a client-side view swap, not a
  // route change, so the browser keeps the roster's scroll position. Jump to the
  // top so the detail opens at the athlete's header instead of mid-page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setPicked(null); // reset to the latest screening when switching athletes
  }, [selectedId]);

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

  // One breakdown, from lib/readiness — counts, the screened denominator and the
  // per-band shares, all tested there against the seeded squad this dashboard
  // actually shows.
  const breakdown = useMemo(
    () => readinessBreakdown(classified.map((x) => x.band)),
    [classified],
  );
  const counts = breakdown.counts;
  const coverage = { scored: breakdown.scored, total: breakdown.total };

  // Whose reading is out of date.
  //
  // AIRMS already emails each coach a monthly list of the athletes in their
  // sport who are overdue or have never been screened — and the dashboard they
  // open showed no trace of it, while rendering every readiness band in the
  // present tense over screenings that may be months old. The data was on this
  // payload the whole time (toIndicator ships recallState and
  // screeningAgeDays); it was simply never drawn. Same argument §33b used to
  // put staleness on the athlete's hero, applied to the reader who acts on it.
  const recall = useMemo(() => {
    const out = { overdue: 0, dueSoon: 0, never: 0 };
    classified.forEach(({ row }) => {
      const st = row.screening?.recallState;
      if (st === 'overdue') out.overdue += 1;
      else if (st === 'due-soon') out.dueSoon += 1;
      // `never` covers both: the recall state the backend assigns, and an
      // athlete with no screening row at all — for a coach chasing people in,
      // those are the same errand.
      else if (st === 'never' || !row.screening) out.never += 1;
    });
    return out;
  }, [classified]);

  // The noise floor the arrows judge against. Comes from the server so this view
  // and the institution's change chart cannot disagree about whether a move is
  // real — it was a literal 2 here, which matched the backend only because
  // reliability declines on thin data and falls back to exactly 2.
  const deadBand = data?.deadBand ?? DEFAULT_DEAD_BAND;

  // Squad momentum — change vs each athlete's previous screening.
  const momentum = useMemo(() => {
    const m = { improving: 0, declining: 0, steady: 0 };
    classified.forEach(({ row }) => {
      const d = trendDelta(row);
      if (d === null) return;
      if (d >= deadBand) m.improving++;
      else if (d <= -deadBand) m.declining++;
      else m.steady++;
    });
    return m;
  }, [classified, deadBand]);

  // Squad screening coverage that the suggestion speaks to (athletes with actual
  // screening data — the "of N" denominator below).
  const screenedForAlerts = useMemo(
    () => classified.filter((x) => x.screening.hasData).length,
    [classified],
  );

  // Smart coaching suggestion — the squad's top shared weak spots turned into a
  // "here's the main issue, here's the adjustment" alert. Aggregates each
  // athlete's region alerts by BODY REGION (so it maps onto a training
  // adjustment) and ranks by how many athletes are elevated there, breaking
  // ties toward sport-critical regions. Each region has one shown indicator, so
  // the elevated/watch athlete sets are disjoint and sum to "athletes flagged".
  const squadConcerns = useMemo(() => {
    type Affected = { athleteId: string; name: string; band: 'high' | 'watch' };
    const map = new Map<BodyRegion, { region: BodyRegion; critical: boolean; who: Map<string, Affected> }>();
    classified.forEach(({ row, screening }) => {
      if (!screening.hasData) return;
      screening.alerts.forEach((a) => {
        const e = map.get(a.region) ?? { region: a.region, critical: false, who: new Map<string, Affected>() };
        // One shown indicator per region, so an athlete lands here once; keep
        // their worst band if the data ever double-counts.
        const band: 'high' | 'watch' = a.band === 'high' ? 'high' : 'watch';
        const prev = e.who.get(row.athleteId);
        if (!prev || (band === 'high' && prev.band !== 'high')) e.who.set(row.athleteId, { athleteId: row.athleteId, name: row.name, band });
        if (a.critical) e.critical = true;
        map.set(a.region, e);
      });
    });
    return [...map.values()]
      .map((e) => {
        // Elevated athletes first, then on-watch, each alphabetical — the order
        // the coach should work down. Counts derive from the same list.
        const athletes = [...e.who.values()].sort((a, b) =>
          (a.band === 'high' ? 0 : 1) - (b.band === 'high' ? 0 : 1) || a.name.localeCompare(b.name));
        const high = athletes.filter((a) => a.band === 'high').length;
        return { region: e.region, critical: e.critical, athletes, high, watch: athletes.length - high };
      })
      .filter((e) => e.athletes.length > 0)
      .sort((a, b) => (b.high - a.high) || (Number(b.critical) - Number(a.critical)) || (b.watch - a.watch))
      .slice(0, 3);
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

  // Athletes to flag to the medical team — those in the Restricted band.
  const attention = useMemo(
    () => classified
      .filter(({ band }) => band === 'restricted')
      .map(({ row, band, worst }) => {
        const factor = (row.screening?.factors ?? []).find((f) => f.includes('over threshold'));
        const reason = factor ?? (worst ? `${worst.label} ${worst.value.toFixed(0)}` : null);
        return { row, band, reason };
      }),
    [classified],
  );

  const total = classified.length;
  // Denominated over SCREENED athletes, not the whole squad.
  //
  // Over the squad the three band tiles summed to 88% on the seeded data: two
  // never-screened athletes were 13% that appeared in no tile and in no bar
  // segment, so the bar simply stopped short of its track with nothing on
  // screen saying why. A band is a statement ABOUT a screening — an athlete
  // without one is not "not cleared", they are unknown — so they are counted
  // out of the percentages and stated separately, which is also the thing a
  // coach can act on (book a first assessment).
  //
  // The card below already reads "N of 14 screened athletes"; this is the same
  // denominator, which is why coverage.scored is reused rather than recomputed.
  // Shares come from the breakdown rather than being recomputed here — a second
  // implementation of the same division is how the denominator drifted before.
  const pct = (b: Band) => breakdown.share[b];

  const selected = useMemo(
    () => (selectedId ? data?.athletes.find((a) => a.athleteId === selectedId) ?? null : null),
    [selectedId, data],
  );

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selected) {
    // Identity (name/sport/age/…) always comes from the roster row; the
    // screening-derived fields come from `view` — the picked past screening if
    // one is selected, else the athlete's latest live data.
    const view = picked ?? selected;
    const screeningData = {
      name: selected.name,
      sport: selected.sport,
      age: selected.age ?? undefined,
      gender: selected.gender ?? undefined,
      overallActivityScore: view.overallActivityScore,
      injuryRiskIndex: view.injuryRiskIndex,
      mobility: view.mobility,
      stability: view.stability,
      symmetry: view.symmetry,
      risks: view.risks,
      subitems: view.screening?.subitems,
    };
    return (
      <DashboardLayout allowedRoles={['coach']} title="Squad Readiness">
        <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelectedId(null)}>
          ← Back to squad
        </button>

        {dlError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{dlError}</div>}

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--brand-navy)', color: 'white', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {getInitials(selected.name)}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ margin: 0 }}>{selected.name}</h2>
              <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
                {selected.athleteId} · {selected.sport} · {selected.program ?? '—'} · {selected.age ? `${selected.age}y` : '—'} · {selected.gender ?? '—'}
              </div>
              {selected.disciplines.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {selected.disciplines.map((d) => (<span key={d} className="badge-low">{d}</span>))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0 }}
              onClick={() => downloadIndividualReport(selected.athleteId)}
              disabled={dlBusy}
            >
              {dlBusy ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        </div>

        <ScreeningDatePicker athleteId={selected.athleteId} onPick={setPicked} />

        <OverallRiskBadge screening={view.screening} hero audience="staff" historical={!!picked} />
        <ScreeningAlertBanner
          risks={view.risks}
          sport={selected.sport}
          band={view.screening?.effectiveBand}
          audience="staff"
          historical={!!picked}
        />

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
              <span className="card-sub">Closer to the centre is better</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
              <RiskRadar
                labels={RADAR_LABELS}
                values={riskRadarSeries(view.risks)}
                thresholds={highThresholdsFor(selected.sport)}
              />
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-md)', lineHeight: 1.5 }}>
                Each spoke is one exercise-risk indicator from {selected.name.split(' ')[0]}&apos;s HoloMotion
                screening, on a 0–30 scale.
              </p>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
                The dashed red line is {selected.name.split(' ')[0]}&apos;s Elevated threshold per
                region. Read-only — clinical decisions and band overrides remain with medical staff.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <ScreeningPanel athlete={screeningData} historical={!!picked} />
        </div>

        {/* Report-to-report progress (read-only, backend scopes to the coach's sport). */}
        <div style={{ marginTop: 20 }}>
          <ScreeningHistory athleteId={selected.athleteId} />
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
              <span className="card-sub">L = left · R = right · B = both</span>
            </div>
          </div>
          <BodyMap myodynamia={view.myodynamia ?? []} tension={view.tension ?? []} subitems={view.screening?.subitems} historical={!!picked} />
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
              {' · '}read-only
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
                      <div className="stat-tile-value">{pct(b)}%</div>
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
                      <div key={b} style={{ width: `${pct(b)}%`, background: BAND_META[b].color }} title={`${BAND_META[b].label}: ${counts[b]}`} />
                    ) : null,
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 6 }}>
                  {counts.unscored > 0 ? (
                    <>
                      Of {coverage.scored} screened athlete{coverage.scored === 1 ? '' : 's'}.{' '}
                      <strong>{counts.unscored}</strong> more {counts.unscored === 1 ? 'has' : 'have'} never been
                      screened and {counts.unscored === 1 ? 'is' : 'are'} not counted above — {counts.unscored === 1 ? 'that athlete needs' : 'they need'} a first assessment, not a review.
                    </>
                  ) : (
                    <>All {coverage.scored} athlete{coverage.scored === 1 ? '' : 's'} in this squad have a screening on record.</>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Smart coaching suggestion — the squad's main shared issue this
          screening round, phrased as a training adjustment the coach can act
          on. Sits above "Needs attention" because it's the headline takeaway. */}
      {squadConcerns.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--brand-gold)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Suggested focus for the squad</h2>
              <span className="card-sub">
                Auto-generated from this screening round
              </span>
            </div>
          </div>
          <ul className="coach-suggest-list">
            {squadConcerns.map((c, i) => (
              <li key={c.region} className={`coach-suggest-item${i === 0 ? ' is-primary' : ''}`}>
                <div className="coach-suggest-head">
                  <span className="coach-suggest-region">{REGION_LABEL[c.region] ?? c.region}</span>
                  {c.critical && data?.sport && (
                    <span className="badge-high">load-critical for {data.sport}</span>
                  )}
                  {c.high > 0 && <span className="badge-high">{c.high} elevated</span>}
                  {c.watch > 0 && <span className="badge-moderate">{c.watch} on watch</span>}
                </div>
                <p className="coach-suggest-magnitude">
                  {i === 0 ? 'Your squad’s biggest shared concern right now — ' : ''}
                  {c.athletes.length} of {screenedForAlerts} screened athlete{screenedForAlerts === 1 ? '' : 's'} flagged
                  at the {REGION_LABEL[c.region].toLowerCase()}.
                </p>
                <p className="coach-suggest-action">{REGION_ADJUSTMENT[c.region]}</p>
                <div className="coach-suggest-athletes">
                  <span className="coach-suggest-who-label">Who to look at:</span>
                  {c.athletes.map((a) => (
                    <button
                      key={a.athleteId}
                      type="button"
                      className={`coach-athlete-chip${a.band === 'high' ? ' is-high' : ''}`}
                      onClick={() => setSelectedId(a.athleteId)}
                      title={`Open ${a.name}'s screening (${a.band === 'high' ? 'elevated' : 'on watch'})`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 12, marginBottom: 0 }}>
            Ranked by how many athletes are flagged in each region this round — a frequency heuristic, not the
            cohort risk model, and general strength-and-conditioning principles rather than individualised
            prescription. Confirm programming with your medical / S&amp;C lead.
          </p>
        </div>
      )}

      {/* Needs attention — the athletes to flag to the medical team */}
      {attention.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--risk-high)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Needs attention ({attention.length})</h2>
              <span className="card-sub">Restricted athletes — raise these with the medical team.</span>
            </div>
          </div>
          <div>
            {attention.map(({ row, band, reason }) => (
              <button key={row.athleteId} type="button" className="athlete-row" onClick={() => setSelectedId(row.athleteId)} style={{ width: '100%' }}>
                <span className="athlete-row-avatar">{getInitials(row.name)}</span>
                <span className="athlete-row-info">
                  <span className="athlete-row-name">
                    {row.name}
                    {band && <span className={BAND_META[band].badge} style={{ marginLeft: 8 }}>{BAND_META[band].label}</span>}
                  </span>
                  <span className="athlete-row-meta">
                    {reason ?? 'flagged'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Squad breakdown — supporting detail behind the suggestion card above:
          muscle hotspots, per-event readiness, and screening momentum. The
          region-level "common weak spots" it used to carry now lives (with an
          adjustment attached) in "Suggested focus for the squad". */}
      {total > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Squad breakdown</h2>
              <span className="card-sub">
                {coverage.scored}/{coverage.total} screened
                {(recall.overdue > 0 || recall.never > 0) && (
                  <>
                    {' · '}
                    <strong style={{ color: 'var(--risk-high)' }}>
                      {recall.overdue > 0 && `${recall.overdue} overdue`}
                      {recall.overdue > 0 && recall.never > 0 && ', '}
                      {recall.never > 0 && `${recall.never} never screened`}
                    </strong>
                  </>
                )}
                {' · momentum since last screening: '}
                <strong style={{ color: 'var(--risk-low)' }}>{momentum.improving} ↑</strong> improving ·{' '}
                <strong style={{ color: 'var(--risk-high)' }}>{momentum.declining} ↓</strong> declining · {momentum.steady} steady
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            <div>
              <strong style={{ fontSize: 'var(--fs-sm)' }}>Muscle hotspots</strong>
              {muscleHotspots.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 6 }}>No muscle flags on record.</div>
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
                <strong style={{ fontSize: 'var(--fs-sm)' }}>Readiness by event</strong>
                <ul className="insight-list" style={{ marginTop: 8 }}>
                  {readinessByEvent.map((e) => {
                    const parts = [
                      e.full > 0 ? <span key="f" style={{ color: 'var(--risk-low)' }}>{e.full} full</span> : null,
                      e.observation > 0 ? <span key="o" style={{ color: 'var(--risk-moderate)' }}>{e.observation} obs</span> : null,
                      e.restricted > 0 ? <span key="r" style={{ color: 'var(--risk-high)' }}>{e.restricted} restricted</span> : null,
                      e.unscored > 0 ? <span key="u" className="text-muted">{e.unscored} n/a</span> : null,
                    ].filter(Boolean);
                    return (
                      <li key={e.discipline}>
                        <strong>{e.discipline}</strong>{' '}
                        <span style={{ fontSize: 'var(--fs-sm)' }}>
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
              <span className="card-sub">Highest concern first · select one to view their screening</span>
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
                  <th style={{ textAlign: 'center' }}>Worst region</th>
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
                      <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>{row.athleteId} · {row.program ?? '—'} · {row.gender ?? '—'}</div>
                      {(row.screening?.recallState === 'overdue' || row.screening?.recallState === 'due-soon') && (
                        <div
                          style={{
                            fontSize: 'var(--fs-2xs)', fontWeight: 700,
                            color: row.screening.recallState === 'overdue' ? 'var(--risk-high)' : 'var(--risk-moderate)',
                          }}
                        >
                          {row.screening.recallState === 'overdue' ? 'Screening overdue' : 'Rescreen due soon'}
                          {typeof row.screening.screeningAgeDays === 'number'
                            && ` · ${row.screening.screeningAgeDays} days old`}
                        </div>
                      )}
                    </td>
                    {squadHasEvents && (
                      <td style={{ fontSize: 'var(--fs-sm)' }}>
                        {row.disciplines.length ? row.disciplines.join(', ') : <span className="text-muted">—</span>}
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      <OverallRiskBadge screening={row.screening} compact />
                    </td>
                    <td style={{ textAlign: 'center' }} title={row.screening?.prevAssessedAt ? `vs ${new Date(row.screening.prevAssessedAt).toISOString().slice(0, 10)}` : 'No earlier screening to compare'}>
                      {(() => {
                        const d = trendDelta(row);
                        if (d === null) return <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>—</span>;
                        if (d >= 2) return <span style={{ color: 'var(--risk-low)', fontWeight: 600 }}>↑ +{d}</span>;
                        if (d <= -2) return <span style={{ color: 'var(--risk-high)', fontWeight: 600 }}>↓ {d}</span>;
                        return <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>steady</span>;
                      })()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {band
                        ? <span className={BAND_META[band].badge}>{BAND_META[band].label}</span>
                        : <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>Not scored</span>}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="table-legend">
            <div><dt>HoloMotion Risk</dt><dd>cohort indicator 0–100 (50 = group average); the mark is the risk band — {RISK_BANDS.map((b: RiskBand, i) => (
              <span key={b}>
                {i > 0 && ' · '}
                <span style={{ color: BAND_RISK_COLOR[b] }}>{BAND_GLYPH[b]}</span>
                {' '}{BAND_SHORT[b].toLowerCase()}
              </span>
            ))}</dd></div>
            <div><dt>Trend</dt><dd>change vs the previous screening — <span style={{ color: 'var(--risk-low)' }}>↑</span> improving · <span style={{ color: 'var(--risk-high)' }}>↓</span> declining · steady within ±{deadBand}{data?.deadBandDerived ? ' (measured from repeat screenings)' : ' (assumed — too few repeat screenings to measure one)'}</dd></div>
            <div><dt>Readiness</dt><dd>Full-Go = cleared · Observation = modified load · Restricted = clinical priority</dd></div>
            <div><dt>Worst region</dt><dd>the athlete&apos;s highest exercise-risk reading this screening</dd></div>
          </dl>
          <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 8, marginBottom: 0 }}>
            Readiness is informational. Clinical decisions and overrides remain with medical staff.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
