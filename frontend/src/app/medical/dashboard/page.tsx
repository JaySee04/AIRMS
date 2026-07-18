'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Fragment, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';

// Chart.js and the body-map path data are the heaviest client code on this
// page and render nothing on the server anyway — split them out so the
// roster/detail shell paints without them.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import { api } from '@/lib/api';
import { classifyCompositeRisk } from '@/lib/risk';
import { WATCH_THRESHOLD } from '@/lib/screeningAlerts';
import { disciplinesForSport, sportHasDisciplines } from '@/lib/disciplines';

interface AthleteRisks {
  neckInjuryRisk: number;
  shoulderInjuryRisk: number;
  scoliosis: number;
  spinalDiscHerniation: number;
  lumbarPelvisInjury: number;
  jointPain: number;
  kneeInjuryRisk: number;
  ankleInjuryRisk: number;
}

interface AthleteListItem {
  athleteId: string;
  name: string;
  sport: string;
  programme?: string;
  program?: string;
  age?: number;
  gender?: string;
  disciplines?: string[];
  isActive?: boolean;
}

interface AthleteFull extends AthleteListItem {
  weight?: number;
  height?: number;
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  screening?: (ScreeningIndicator & { screeningId?: number }) | null;
}

interface Activity {
  _id: string;
  date: string;
  type: string;
  duration: number;
  intensity: number;
  load: number;
  notes?: string;
}

interface Injury {
  _id: string;
  athleteId?: string;      // present on system-wide queries; optional on per-athlete views
  athleteName?: string;
  sport?: string;
  bodyPart: string;
  side: string;
  injuryType: string;
  severity: string;
  mechanism?: string;
  date: string;
  recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic';
  notes?: string;
}

const RISK_LABEL: Record<keyof AthleteRisks, string> = {
  neckInjuryRisk: 'Neck',
  shoulderInjuryRisk: 'Shoulder',
  scoliosis: 'Scoliosis',
  spinalDiscHerniation: 'Spinal Disc',
  lumbarPelvisInjury: 'Lumbar/Pelvis',
  jointPain: 'Joint Pain',
  kneeInjuryRisk: 'Knee',
  ankleInjuryRisk: 'Ankle',
};

// spinalDiscHerniation (Lumbar Disc Herniation) is deliberately ABSENT: stored
// on import but excluded from every risk display per Dr Thung — ISN's
// facilities don't support that assessment. Mirrors the athlete dashboard and
// SHOWN_RISK_KEYS in backend/src/utils/cohorts.js.
const RISK_KEYS: Array<keyof AthleteRisks> = [
  'neckInjuryRisk',
  'shoulderInjuryRisk',
  'scoliosis',
  'lumbarPelvisInjury',
  'jointPain',
  'kneeInjuryRisk',
  'ankleInjuryRisk',
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Maps a flagged muscle to the body region it most affects. Used by the
// prevention-insight generator to cross-reference muscle flags with risk
// indicators and prior injuries.
const MUSCLE_REGION: Record<string, 'Neck' | 'Shoulder' | 'Spine/Lumbar' | 'Hip' | 'Knee' | 'Elbow'> = {
  Sternocleidomastoid: 'Neck',
  'Rectus Capitis Anterior': 'Neck',
  'Upper Trapezius': 'Neck',
  'Middle Deltoid': 'Shoulder',
  'Lateral Deltoid': 'Shoulder',
  'Posterior Deltoid': 'Shoulder',
  'Pectoralis Major': 'Shoulder',
  'Latissimus Dorsi': 'Spine/Lumbar',
  'Rectus Abdominis': 'Spine/Lumbar',
  'External Oblique': 'Spine/Lumbar',
  'Internal Oblique': 'Spine/Lumbar',
  'Biceps Brachii': 'Elbow',
  Iliopsoas: 'Hip',
  'Gluteus Medius': 'Hip',
  'Gluteus Minimus': 'Hip',
  'Gluteus Maximus': 'Hip',
  Piriformis: 'Hip',
  'Vastus Lateralis': 'Knee',
  'Vastus Medialis': 'Knee',
  'Rectus Femoris': 'Knee',
  Sartorius: 'Knee',
  'Biceps Femoris': 'Knee',
};

// Risk indicator → body region the indicator points to.
const RISK_REGION: Record<keyof AthleteRisks, 'Neck' | 'Shoulder' | 'Spine/Lumbar' | 'Hip' | 'Knee' | 'Ankle'> = {
  neckInjuryRisk: 'Neck',
  shoulderInjuryRisk: 'Shoulder',
  scoliosis: 'Spine/Lumbar',
  spinalDiscHerniation: 'Spine/Lumbar',
  lumbarPelvisInjury: 'Spine/Lumbar',
  jointPain: 'Hip',
  kneeInjuryRisk: 'Knee',
  ankleInjuryRisk: 'Ankle',
};

interface PreventionInsight {
  headline: string;
  watchPoints: string[];
  actions: string[];
}

interface CountBucket { _id: string; count: number; }
interface SportContext {
  total: number;
  athletesAffected: number;
  byBodyPart: CountBucket[];
  byType: CountBucket[];
  bySeverity: CountBucket[];
}

interface RecoveryBaselineRow {
  _id: string;
  athleteId: string;
  snapshotAcwr: number;
  chronicLoad: number;
  targetLowMin: number;
  targetLowMax: number;
  triggerCls: 'mod' | 'high' | 'under';
  triggerLevel: string;
  factors?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

function buildPreventionInsight(
  athlete: AthleteFull,
  injuries: Injury[],
  riskLevel: 'low' | 'mod' | 'high' | 'under',
): PreventionInsight | null {
  // Top elevated risk indicators (over the shared screening watch threshold)
  const elevated = RISK_KEYS
    .map((k) => ({ key: k, label: RISK_LABEL[k], value: athlete.risks[k] ?? 0, region: RISK_REGION[k] }))
    .filter((r) => r.value > WATCH_THRESHOLD)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  // Flagged muscle regions
  const flaggedRegions = new Set<string>();
  (athlete.myodynamia ?? []).forEach((m) => {
    const r = MUSCLE_REGION[m.muscle];
    if (r) flaggedRegions.add(r);
  });
  (athlete.tension ?? []).forEach((m) => {
    const r = MUSCLE_REGION[m.muscle];
    if (r) flaggedRegions.add(r);
  });

  // Prior injuries in the last 12 months, grouped by body part
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const recentInjuries = injuries.filter((i) => new Date(i.date) >= twelveMonthsAgo);
  const recentBodyParts = new Set(recentInjuries.map((i) => i.bodyPart));

  if (elevated.length === 0 && flaggedRegions.size === 0 && recentBodyParts.size === 0) {
    return null;
  }

  // Compose watch-points: regions where TWO of (elevated risk / muscle flag /
  // recent injury) align are the highest-confidence ones.
  const regions: Record<string, { signals: string[]; score: number }> = {};
  const note = (region: string, signal: string) => {
    if (!regions[region]) regions[region] = { signals: [], score: 0 };
    regions[region].signals.push(signal);
    regions[region].score += 1;
  };
  elevated.forEach((r) => note(r.region, `${r.label} risk indicator ${r.value.toFixed(1)}`));
  flaggedRegions.forEach((r) => note(r, 'muscle flag from latest screening'));
  recentBodyParts.forEach((bp) => note(bp, 'prior injury (last 12 months)'));

  const ranked = Object.entries(regions)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  const watchPoints = ranked.map(([region, info]) =>
    `${region}: ${info.signals.join('; ')}`,
  );

  // Recommended actions tied to risk class.
  const actions: string[] = [];
  if (riskLevel === 'high' || riskLevel === 'mod') {
    actions.push('Reduce volume in next 2–3 sessions; avoid stacking high-intensity work');
  }
  if (flaggedRegions.size > 0) {
    actions.push('Address flagged muscle imbalances with prehab / activation work before next match');
  }
  if (recentInjuries.some((i) => i.recoveryStatus === 'Recovering')) {
    actions.push('Confirm graded return-to-play criteria for currently recovering injuries');
  }
  if (actions.length === 0) {
    actions.push('Maintain current training volume; reassess at next screening');
  }

  const headline = ranked.length
    ? `${athlete.name.split(' ')[0]} — watch points: ${ranked.map(([r]) => r).join(', ')}`
    : `${athlete.name.split(' ')[0]} — no convergent risk signals right now`;

  return { headline, watchPoints, actions };
}

export default function MedicalDashboard() {
  const [athletes, setAthletes] = useState<AthleteListItem[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterSport, setFilterSport] = useState('');
  const [filterProgramme, setFilterProgramme] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // System-wide signals used by the empty-state quick-access groups.
  const [allInjuriesAcrossSystem, setAllInjuriesAcrossSystem] = useState<Injury[]>([]);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  // Selected-athlete state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteFull | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<Activity[]>([]);
  const [selectedInjuries, setSelectedInjuries] = useState<Injury[]>([]);
  const [sportContext, setSportContext] = useState<SportContext | null>(null);
  const [activeBaseline, setActiveBaseline] = useState<RecoveryBaselineRow | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleNote(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<'' | 'ind' | 'team'>('');
  // Download errors get their own state (NOT selectedError) — selectedError is
  // checked before the athlete content in the render, so reusing it would blank
  // the whole pane on a failed download.
  const [pdfError, setPdfError] = useState<string | null>(null);

  // HoloMotion screening reports — the same PDFs admin can pull from the Reports
  // page. The backend gates both on the viewRecords permission. Individual is
  // keyed by athlete ID; team is scoped to the selected athlete's sport.
  async function downloadIndividualReport() {
    if (!selectedAthlete) return;
    setPdfBusy('ind'); setPdfError(null);
    try {
      await api.downloadGet(
        `/screening-reports/individual/${selectedAthlete.athleteId}.pdf`,
        `AIRMS-${selectedAthlete.athleteId}.pdf`,
      );
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setPdfBusy('');
    }
  }

  async function downloadTeamReport() {
    if (!selectedAthlete?.sport) return;
    setPdfBusy('team'); setPdfError(null);
    try {
      await api.downloadGet(
        `/screening-reports/team.pdf?sport=${encodeURIComponent(selectedAthlete.sport)}`,
        `AIRMS-team-${selectedAthlete.sport}.pdf`,
      );
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setPdfBusy('');
    }
  }

  // Initial roster load + system-wide signals for the empty-state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        const [list, sportsList, injuriesAll, pendingReports] = await Promise.all([
          api.get<AthleteListItem[]>('/athletes'),
          api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]),
          api.get<Injury[]>('/injuries').catch(() => [] as Injury[]),
          api.get<unknown[]>('/self-reports?status=Pending').catch(() => [] as unknown[]),
        ]);
        if (!cancelled) {
          setAthletes(list);
          setSports(sportsList);
          setAllInjuriesAcrossSystem(injuriesAll);
          setPendingReportsCount(pendingReports.length);
          setListError(null);
        }
      } catch (e) {
        if (!cancelled) setListError(e instanceof Error ? e.message : 'Failed to load athletes');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-selection data load
  useEffect(() => {
    if (!selectedId) {
      setSelectedAthlete(null);
      setSelectedActivities([]);
      setSelectedInjuries([]);
      setSportContext(null);
      setActiveBaseline(null);
      return;
    }
    let cancelled = false;
    setPdfError(null);
    (async () => {
      try {
        setLoadingSelected(true);
        const [a, acts, injs, baselines] = await Promise.all([
          api.get<AthleteFull>(`/athletes/${selectedId}`),
          api.get<Activity[]>(`/activities/athlete/${selectedId}`).catch(() => [] as Activity[]),
          api.get<Injury[]>(`/injuries/athlete/${selectedId}`).catch(() => [] as Injury[]),
          api.get<RecoveryBaselineRow[]>(`/recovery-baselines/athlete/${selectedId}?active=1`).catch(() => [] as RecoveryBaselineRow[]),
        ]);
        if (!cancelled) {
          setSelectedAthlete(a);
          setSelectedActivities(acts);
          setSelectedInjuries(injs);
          setActiveBaseline(baselines[0] ?? null);
          setSelectedError(null);
        }
        // Sport-level context: aggregated injuries filtered to this athlete's sport.
        // Fired in a second pass because it depends on the athlete record we just fetched.
        if (a?.sport) {
          const ctx = await api
            .get<SportContext>(`/injuries/analytics/summary?sport=${encodeURIComponent(a.sport)}`)
            .catch(() => null);
          if (!cancelled) setSportContext(ctx);
        } else if (!cancelled) {
          setSportContext(null);
        }
      } catch (e) {
        if (!cancelled) setSelectedError(e instanceof Error ? e.message : 'Failed to load athlete');
      } finally {
        if (!cancelled) setLoadingSelected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Filtered roster
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      if (q && !(a.name.toLowerCase().includes(q) || a.athleteId.toLowerCase().includes(q))) return false;
      if (filterSport && a.sport !== filterSport) return false;
      const prog = a.programme ?? a.program;
      if (filterProgramme && prog !== filterProgramme) return false;
      if (filterGender && a.gender !== filterGender) return false;
      if (filterDiscipline && !(a.disciplines ?? []).includes(filterDiscipline)) return false;
      return true;
    });
  }, [athletes, search, filterSport, filterProgramme, filterGender, filterDiscipline]);

  // Workload computation for selected athlete (mirrors athlete dashboard)
  const workload = useMemo(() => {
    if (!selectedAthlete) return null;
    const today = new Date();
    const DAY = 86400000;
    const weekLoads: number[] = Array(8).fill(0);
    const weekTypeBreakdowns: Array<Record<string, number>> = Array.from({ length: 8 }, () => ({}));
    const weekLabels: string[] = [];
    for (let i = 0; i < 8; i++) {
      weekLabels.push(8 - i === 1 ? 'This wk' : `${8 - i} wk ago`);
    }
    selectedActivities.forEach((a) => {
      const aDate = new Date(a.date);
      const daysAgo = Math.floor((today.getTime() - aDate.getTime()) / DAY);
      if (daysAgo < 0 || daysAgo >= 56) return;
      const bucketFromEnd = Math.floor(daysAgo / 7);
      const index = 7 - bucketFromEnd;
      if (index >= 0 && index < 8) {
        const load = a.load ?? 0;
        weekLoads[index] += load;
        const t = a.type || 'Other';
        weekTypeBreakdowns[index][t] = (weekTypeBreakdowns[index][t] ?? 0) + load;
      }
    });
    const acuteLoad = weekLoads[7] ?? 0;
    const chronicLoad = weekLoads.slice(-4).reduce((s, v) => s + v, 0) / 4;
    const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
    const cumACWR = weekLoads.map((_, i) => {
      const acuteW = weekLoads[i];
      const slice = weekLoads.slice(Math.max(0, i - 3), i + 1);
      const chronicW = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
      return chronicW > 0 ? +(acuteW / chronicW).toFixed(2) : 0;
    });
    return { weekLabels, weekLoads, weekTypeBreakdowns, acuteLoad, chronicLoad, acwr, cumACWR };
  }, [selectedAthlete, selectedActivities]);

  const recentActivities = useMemo(
    () => [...selectedActivities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8),
    [selectedActivities],
  );

  const allInjuries = useMemo(
    () => [...selectedInjuries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    [selectedInjuries],
  );
  const activeInjuries = useMemo(
    () => allInjuries.filter((i) => i.recoveryStatus !== 'Recovered'),
    [allInjuries],
  );

  const risk = useMemo(() => {
    if (!selectedAthlete || !workload) return null;
    return classifyCompositeRisk(workload.acwr, selectedAthlete, activeInjuries);
  }, [selectedAthlete, workload, activeInjuries]);

  const insight = useMemo(() => {
    if (!selectedAthlete || !risk) return null;
    return buildPreventionInsight(selectedAthlete, allInjuries, risk.cls);
  }, [selectedAthlete, allInjuries, risk]);

  // Recovery baseline auto-trigger. Opens a baseline when composite risk
  // first lands outside Low; resolves the active baseline once the athlete
  // returns to Low (or Detraining, which is its own forward-looking flag,
  // not an injury-context elevation).
  useEffect(() => {
    if (!selectedAthlete || !risk || !workload) return;
    const nonLow = risk.cls === 'mod' || risk.cls === 'high';
    const cancelled = { v: false };
    (async () => {
      if (nonLow && !activeBaseline) {
        const created = await api
          .post<RecoveryBaselineRow>('/recovery-baselines', {
            athleteId: selectedAthlete.athleteId,
            snapshotAcwr: +workload.acwr.toFixed(2),
            chronicLoad: +workload.chronicLoad.toFixed(0),
            targetLowMin: risk.personalisedRange.lowMin,
            targetLowMax: risk.personalisedRange.lowMax,
            triggerCls: risk.cls,
            triggerLevel: risk.level,
            factors: risk.factors,
          })
          .catch(() => null);
        if (!cancelled.v && created) setActiveBaseline(created);
      } else if (!nonLow && activeBaseline) {
        await api
          .patch<RecoveryBaselineRow>(`/recovery-baselines/athlete/${selectedAthlete.athleteId}/resolve`, {})
          .catch(() => null);
        if (!cancelled.v) setActiveBaseline(null);
      }
    })();
    return () => { cancelled.v = true; };
  }, [selectedAthlete, risk, workload, activeBaseline]);

  // Sport context: top body parts / injury types within the athlete's sport,
  // with this athlete's own injury body parts and types marked so the clinician
  // can read individual cases against the sport-wide pattern in one glance.
  const athleteBodyParts = useMemo(
    () => new Set(allInjuries.map((i) => i.bodyPart)),
    [allInjuries],
  );
  const athleteInjuryTypes = useMemo(
    () => new Set(allInjuries.map((i) => i.injuryType)),
    [allInjuries],
  );
  const sportTopBodyParts = useMemo(() => {
    if (!sportContext) return [];
    return [...sportContext.byBodyPart].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [sportContext]);
  const sportTopTypes = useMemo(() => {
    if (!sportContext) return [];
    return [...sportContext.byType].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [sportContext]);

  // Distinct programmes available in the roster (for the filter dropdown)
  const programmes = useMemo(() => {
    const set = new Set<string>();
    athletes.forEach((a) => {
      const p = a.programme ?? a.program;
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [athletes]);

  // Athletes with at least one currently-active (non-Recovered) injury — the
  // clinician's natural first stop on opening the dashboard.
  const activeInjuryAthletes = useMemo(() => {
    const map = new Map<string, { athleteId: string; athleteName: string; sport?: string; cases: number }>();
    allInjuriesAcrossSystem.forEach((i) => {
      if (i.recoveryStatus === 'Recovered') return;
      if (!i.athleteId) return;
      const existing = map.get(i.athleteId);
      if (existing) existing.cases++;
      else map.set(i.athleteId, {
        athleteId: i.athleteId,
        athleteName: i.athleteName || i.athleteId,
        sport: i.sport,
        cases: 1,
      });
    });
    return Array.from(map.values()).sort((a, b) => b.cases - a.cases);
  }, [allInjuriesAcrossSystem]);

  // Recently-logged injuries (last 14 days) — surfaces the freshest cases.
  const recentInjuries = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000;
    return allInjuriesAcrossSystem
      .filter((i) => new Date(i.date).getTime() >= cutoff)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [allInjuriesAcrossSystem]);

  // Clinician override of the overall risk band after a real assessment.
  async function setOverride(band: 'green' | 'amber' | 'red' | null) {
    const sid = selectedAthlete?.screening?.screeningId;
    if (!sid) return;
    let note = '';
    if (band) {
      note = window.prompt(`Assessment note for setting risk to "${band}" (required):`) || '';
      if (!note.trim()) return;
    }
    try {
      await api.patch(`/screenings/${sid}/override`, band ? { band, note } : {});
      const a = await api.get<AthleteFull>(`/athletes/${selectedId}`);
      setSelectedAthlete(a);
    } catch { /* surfaced by the effect on next load */ }
  }

  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="viewRecords" title="Athlete Dashboard">
      <div className="medical-shell">
        {/* ── Left rail ───────────────────────────────────────────────────── */}
        <aside className="medical-rail">
          <div className="medical-rail-search">
            <input
              id="med-search"
              type="text"
              placeholder="Search name or athlete ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              className="medical-rail-search-input"
            />
            <div className="medical-rail-filters">
              <select
                value={filterSport}
                onChange={(e) => { setFilterSport(e.target.value); setFilterDiscipline(''); }}
                aria-label="Filter by sport"
              >
                <option value="">All Sports</option>
                {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <select
                value={filterProgramme}
                onChange={(e) => setFilterProgramme(e.target.value)}
                aria-label="Filter by programme"
              >
                <option value="">All Programmes</option>
                {programmes.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                aria-label="Filter by gender"
              >
                <option value="">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
              {/* Event filter appears once a sport with events is selected. */}
              {sportHasDisciplines(filterSport) && (
                <select
                  value={filterDiscipline}
                  onChange={(e) => setFilterDiscipline(e.target.value)}
                  aria-label="Filter by event"
                >
                  <option value="">All Events</option>
                  {disciplinesForSport(filterSport).map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              )}
            </div>
            <div className="medical-rail-count">
              {loadingList ? 'Loading…' : `${filtered.length} athlete${filtered.length === 1 ? '' : 's'}`}
            </div>
          </div>

          <div className="medical-rail-list" role="listbox" aria-label="Athletes">
            {loadingList ? (
              <p className="text-muted" style={{ padding: 12 }}>Loading roster…</p>
            ) : listError ? (
              <div className="alert alert-error">{listError}</div>
            ) : filtered.length === 0 ? (
              <p className="text-muted" style={{ padding: 12 }}>No athletes match your filters.</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.athleteId}
                  type="button"
                  className={`athlete-row${selectedId === a.athleteId ? ' active' : ''}`}
                  onClick={() => setSelectedId(a.athleteId)}
                  role="option"
                  aria-selected={selectedId === a.athleteId}
                >
                  <span className="athlete-row-avatar">{getInitials(a.name)}</span>
                  <span className="athlete-row-info">
                    <span className="athlete-row-name">{a.name}</span>
                    <span className="athlete-row-meta">
                      {a.sport ?? '—'} · {a.athleteId}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Right pane ──────────────────────────────────────────────────── */}
        <section className="medical-pane">
          {!selectedId ? (
            /* Empty state — clinician's natural entry points */
            <>
              <div className="card medical-empty-hero">
                <h2 style={{ margin: 0 }}>Pick an athlete to begin</h2>
                <p className="text-muted" style={{ margin: '6px 0 0' }}>
                  Search the rail on the left, or jump in via the quick-access groups below.
                </p>
              </div>

              <div className="stat-grid" style={{ marginTop: 16 }}>
                <div className="stat-tile">
                  <div className="stat-tile-label">Athletes on roster</div>
                  <div className="stat-tile-value">{loadingList ? '…' : athletes.length}</div>
                  <div className="stat-tile-delta">Active</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">With active injuries</div>
                  <div className="stat-tile-value">{loadingList ? '…' : activeInjuryAthletes.length}</div>
                  <div className="stat-tile-delta">Currently recovering / chronic</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Self-reports pending</div>
                  <div className="stat-tile-value">{loadingList ? '…' : pendingReportsCount}</div>
                  <div className="stat-tile-delta">Awaiting review</div>
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Athletes with active injuries</h2>
                    <span className="text-muted">{activeInjuryAthletes.length}</span>
                  </div>
                  {activeInjuryAthletes.length === 0 ? (
                    <div className="empty-state">No active injuries on record.</div>
                  ) : (
                    <div>
                      {activeInjuryAthletes.slice(0, 8).map((a) => (
                        <button
                          key={a.athleteId}
                          type="button"
                          className="athlete-row"
                          onClick={() => setSelectedId(a.athleteId)}
                        >
                          <span className="athlete-row-avatar">{getInitials(a.athleteName)}</span>
                          <span className="athlete-row-info">
                            <span className="athlete-row-name">{a.athleteName}</span>
                            <span className="athlete-row-meta">
                              {a.sport ?? '—'} · {a.cases} active case{a.cases === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Recently logged (14 days)</h2>
                    <span className="text-muted">{recentInjuries.length}</span>
                  </div>
                  {recentInjuries.length === 0 ? (
                    <div className="empty-state">No injuries logged in the last 14 days.</div>
                  ) : (
                    <div>
                      {recentInjuries.map((i) => (
                        <button
                          key={i._id}
                          type="button"
                          className="athlete-row"
                          onClick={() => i.athleteId && setSelectedId(i.athleteId)}
                          disabled={!i.athleteId}
                        >
                          <span className="athlete-row-avatar">{getInitials(i.athleteName ?? '?')}</span>
                          <span className="athlete-row-info">
                            <span className="athlete-row-name">{i.athleteName ?? i.athleteId ?? 'Unknown'}</span>
                            <span className="athlete-row-meta">
                              {i.bodyPart} ({i.side}) — {i.injuryType} · {new Date(i.date).toISOString().slice(0, 10)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : loadingSelected ? (
            <p className="text-muted">Loading athlete details…</p>
          ) : selectedError ? (
            <div className="alert alert-error">{selectedError}</div>
          ) : selectedAthlete && workload && risk ? (
            <>
              {/* Athlete header card */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'var(--brand-navy)', color: 'white',
                    display: 'grid', placeItems: 'center',
                    fontSize: '1.3rem', fontWeight: 600,
                  }}>
                    {getInitials(selectedAthlete.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0 }}>{selectedAthlete.name}</h2>
                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                      {selectedAthlete.athleteId} · {selectedAthlete.sport} ·{' '}
                      {selectedAthlete.programme ?? selectedAthlete.program} ·{' '}
                      {selectedAthlete.age ? `${selectedAthlete.age}y` : '—'}{' '}·{' '}
                      {selectedAthlete.gender ?? '—'}
                    </div>
                    {(selectedAthlete.disciplines?.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {selectedAthlete.disciplines!.map((d) => (<span key={d} className="badge-low">{d}</span>))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {selectedAthlete.screening && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={downloadIndividualReport}
                        disabled={pdfBusy !== ''}
                      >
                        {pdfBusy === 'ind' ? 'Preparing…' : 'Download PDF'}
                      </button>
                    )}
                    {selectedAthlete.sport && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={downloadTeamReport}
                        disabled={pdfBusy !== ''}
                        title={`Team screening report for ${selectedAthlete.sport}`}
                      >
                        {pdfBusy === 'team' ? 'Preparing…' : 'Team PDF'}
                      </button>
                    )}
                    <Link
                      href={`/medical/injury-log?athleteId=${encodeURIComponent(selectedAthlete.athleteId)}`}
                      className="btn btn-gold"
                    >
                      + Log Injury
                    </Link>
                  </div>
                </div>
                {pdfError && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{pdfError}</div>}
              </div>

              {/* The sport-aware screening detail sits BELOW the hero now — it
                  explains the band rather than competing with it. See the
                  rationale in ScreeningAlertBanner.tsx. */}

              {/* PRIMARY risk signal — cohort-normed HoloMotion indicator (a
                  full-width verdict banner) with the clinician override beneath
                  it, then the risk radar below (mirrors the athlete dashboard;
                  a full-width hero avoids the dead gap a "Safe" athlete's short
                  hero left beside the taller radar). The ACWR / composite
                  training-load hero, its gauge and the workload chart were
                  removed on 2026-07-16 so the clinician reads one verdict, not
                  two competing ones. The composite model still runs — it drives
                  the recovery baseline below. See docs/fyp/ACWR_REBUILD.md. */}
              <OverallRiskBadge screening={selectedAthlete.screening} hero />
              {selectedAthlete.screening?.screeningId && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '-8px 0 0', flexWrap: 'wrap' }}>
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>After assessment, set band:</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setOverride('green')}>Green</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setOverride('amber')}>Amber</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setOverride('red')}>Red</button>
                  {selectedAthlete.screening.overrideBand && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setOverride(null)}>Clear override</button>
                  )}
                </div>
              )}
              {/* Which regions sit behind an amber/red band. Renders nothing
                  when the athlete is green overall. Sits between the verdict and
                  the radar overview: verdict → why → overview → detail. */}
              <ScreeningAlertBanner
                risks={selectedAthlete.risks}
                sport={selectedAthlete.sport}
                band={selectedAthlete.screening?.effectiveBand}
                audience="staff"
              />

              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
                    <span className="card-sub">Latest screening · lower is better</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
                    <RiskRadar
                      labels={RISK_KEYS.map((k) => RISK_LABEL[k])}
                      values={RISK_KEYS.map((k) => Math.min(30, Math.max(0, selectedAthlete.risks[k] ?? 0)))}
                    />
                  </div>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <p style={{ margin: '0 0 10px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      Each spoke is one exercise-risk indicator from the athlete&apos;s latest
                      HoloMotion screening, on a 0–30 scale. <strong>Closer to the centre
                      is better.</strong>
                    </p>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Exact values and the sport-personalised thresholds are on the
                      screening panel below; use the band buttons above to override
                      after an assessment.
                    </p>
                  </div>
                </div>
              </div>

              {/* Recovery baseline — open snapshot of pre-elevation training state.
                  Auto-created when composite risk first leaves Low; auto-resolved
                  when the athlete returns to Low. Acts as a clinician-facing
                  return-to-play target. */}
              {activeBaseline && (
                <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--brand-gold)' }}>
                  <div className="card-header" style={{ marginBottom: 8 }}>
                    <div>
                      <h2 className="card-title" style={{ marginBottom: 0 }}>Recovery baseline</h2>
                      <span className="card-sub">
                        Opened {new Date(activeBaseline.createdAt).toISOString().slice(0, 10)} ·
                        triggered by <strong>{activeBaseline.triggerLevel}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="kv-grid">
                    <div>
                      <span>Return-to-Low band</span>
                      <strong>
                        {activeBaseline.targetLowMin.toFixed(2)} – {activeBaseline.targetLowMax.toFixed(2)} ACWR
                      </strong>
                    </div>
                    <div>
                      <span>Snapshot ACWR</span>
                      <strong>{activeBaseline.snapshotAcwr.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Chronic load at snapshot</span>
                      <strong>{Math.round(activeBaseline.chronicLoad)} AU</strong>
                    </div>
                  </div>
                  {activeBaseline.factors && (
                    <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: 10 }}>
                      Trigger factors: {activeBaseline.factors}
                    </div>
                  )}
                </div>
              )}

              {/* Prevention insight — clinical advice tailored to this athlete */}
              {insight && (
                <div className="insight-card">
                  <div className="insight-card-head">
                    <span className="insight-card-icon" aria-hidden>⚕</span>
                    <div>
                      <div className="insight-card-title">Prevention insight</div>
                      <div className="insight-card-sub">Cross-references workload, screening flags, and injury history</div>
                    </div>
                  </div>
                  <div className="insight-card-headline">{insight.headline}</div>
                  {insight.watchPoints.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>Watch points</strong>
                      <ul className="insight-list">
                        {insight.watchPoints.map((w) => (<li key={w}>{w}</li>))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <strong style={{ fontSize: '0.82rem' }}>Recommended actions</strong>
                    <ul className="insight-list">
                      {insight.actions.map((a) => (<li key={a}>{a}</li>))}
                    </ul>
                  </div>
                </div>
              )}

              {/* HoloMotion screening — the athlete's latest report read
                  against its thresholds (gauges + indicator strips + muscle
                  flags), embedded here instead of a separate screening page. */}
              <div style={{ marginTop: 20 }}>
                <ScreeningPanel athlete={selectedAthlete} />
              </div>

              {/* Body map */}
              <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
                    <span className="card-sub">Latest screening · L = left, R = right, B = both</span>
                  </div>
                </div>
                <BodyMap
                  myodynamia={selectedAthlete.myodynamia ?? []}
                  tension={selectedAthlete.tension ?? []}
                />
              </div>

              {/* Recent activity (athlete-logged sessions, with their notes) */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Recent Activity</h2>
                    <span className="card-sub">Athlete-logged sessions · notes shown when present</span>
                  </div>
                  <span className="text-muted">
                    {recentActivities.length} of {selectedActivities.length}
                  </span>
                </div>
                {recentActivities.length === 0 ? (
                  <div className="empty-state">No activities logged for this athlete.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th><th>Type</th><th>Duration</th><th>Intensity</th><th>Load</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActivities.map((a) => {
                          const isExpanded = expandedNotes.has(a._id);
                          return (
                            <Fragment key={a._id}>
                              <tr>
                                <td>
                                  {a.notes && (
                                    <button
                                      type="button"
                                      className="note-caret"
                                      onClick={() => toggleNote(a._id)}
                                      aria-expanded={isExpanded}
                                      aria-label={isExpanded ? 'Hide note' : 'Show note'}
                                      title={isExpanded ? 'Hide note' : 'Show note'}
                                    >
                                      {isExpanded ? '▾' : '▸'}
                                    </button>
                                  )}
                                  {new Date(a.date).toISOString().slice(0, 10)}
                                </td>
                                <td>{a.type}</td>
                                <td>{a.duration} min</td>
                                <td>{a.intensity}/10</td>
                                <td><strong>{a.load}</strong></td>
                              </tr>
                              {isExpanded && a.notes && (
                                <tr className="activity-notes-row">
                                  <td colSpan={5}>
                                    <div className="activity-note">📝 {a.notes}</div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sport context — situates this athlete against their sport's overall injury pattern */}
              {sportContext && sportContext.total > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <div>
                      <h2 className="card-title" style={{ marginBottom: 0 }}>
                        Sport Context — {selectedAthlete.sport}
                      </h2>
                      <span className="card-sub">
                        How {selectedAthlete.name.split(' ')[0]}&apos;s injuries compare to the sport&apos;s overall pattern
                      </span>
                    </div>
                  </div>
                  <div className="stat-grid" style={{ marginBottom: 16 }}>
                    <div className="stat-tile">
                      <div className="stat-tile-label">Total cases ({selectedAthlete.sport})</div>
                      <div className="stat-tile-value">{sportContext.total}</div>
                      <div className="stat-tile-delta">All time</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-tile-label">Athletes affected</div>
                      <div className="stat-tile-value">{sportContext.athletesAffected}</div>
                      <div className="stat-tile-delta">Within {selectedAthlete.sport}</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-tile-label">This athlete</div>
                      <div className="stat-tile-value">{allInjuries.length}</div>
                      <div className="stat-tile-delta">
                        {sportContext.total > 0
                          ? `${((allInjuries.length / sportContext.total) * 100).toFixed(1)}% of sport`
                          : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>Top body parts in {selectedAthlete.sport}</strong>
                      {sportTopBodyParts.length === 0 ? (
                        <div className="empty-state">No data</div>
                      ) : (
                        <ul className="insight-list" style={{ marginTop: 8 }}>
                          {sportTopBodyParts.map((b) => {
                            const pct = (b.count / sportContext.total) * 100;
                            const overlap = athleteBodyParts.has(b._id);
                            return (
                              <li key={b._id}>
                                <strong>{b._id}</strong> — {b.count} ({pct.toFixed(0)}%)
                                {overlap && (
                                  <span className="badge-moderate" style={{ marginLeft: 8 }}>
                                    also seen in this athlete
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>Top injury types in {selectedAthlete.sport}</strong>
                      {sportTopTypes.length === 0 ? (
                        <div className="empty-state">No data</div>
                      ) : (
                        <ul className="insight-list" style={{ marginTop: 8 }}>
                          {sportTopTypes.map((t) => {
                            const pct = (t.count / sportContext.total) * 100;
                            const overlap = athleteInjuryTypes.has(t._id);
                            return (
                              <li key={t._id}>
                                <strong>{t._id}</strong> — {t.count} ({pct.toFixed(0)}%)
                                {overlap && (
                                  <span className="badge-moderate" style={{ marginLeft: 8 }}>
                                    also seen in this athlete
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                  {sportContext.bySeverity.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <strong style={{ fontSize: '0.82rem' }}>Severity mix</strong>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {sportContext.bySeverity.map((s) => {
                          const cls = s._id === 'Severe'
                            ? 'badge-high'
                            : s._id === 'Moderate'
                              ? 'badge-moderate'
                              : 'badge-low';
                          return (
                            <span key={s._id} className={cls}>
                              {s._id}: {s.count}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Injury history */}
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Injury History</h2>
                  <span className="text-muted">{allInjuries.length} record{allInjuries.length === 1 ? '' : 's'}</span>
                </div>
                {allInjuries.length === 0 ? (
                  <div className="empty-state">No injuries on record.</div>
                ) : (
                  allInjuries.map((i) => (
                    <div key={i._id} className="injury-record">
                      <div className="injury-record-head">
                        <div>
                          <strong>{i.bodyPart} ({i.side}) — {i.injuryType}</strong>
                          <div className="injury-record-meta">
                            {new Date(i.date).toISOString().slice(0, 10)} · {i.severity}{i.mechanism ? ` · ${i.mechanism}` : ''}
                          </div>
                        </div>
                        <span className={i.recoveryStatus === 'Recovered' ? 'badge-low' : i.recoveryStatus === 'Recovering' ? 'badge-moderate' : 'badge-high'}>
                          {i.recoveryStatus}
                        </span>
                      </div>
                      {i.notes && <div className="injury-record-notes">{i.notes}</div>}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  );
}
