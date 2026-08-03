'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import ClinicianBandOverride from '@/components/dashboard/ClinicianBandOverride';
import { highThresholdsFor } from '@/lib/screeningAlerts';

// Chart.js and the body-map path data are the heaviest client code on this
// page and render nothing on the server anyway — split them out so the
// roster/detail shell paints without them.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningHistory from '@/components/dashboard/ScreeningHistory';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import ScreeningDatePicker, { FullScreening } from '@/components/dashboard/ScreeningDatePicker';
import InjuryStatusControl from '@/components/dashboard/InjuryStatusControl';
import { api } from '@/lib/api';
import { disciplinesForSport } from '@/lib/disciplines';
import { getInitials } from '@/lib/name';
import TagCombobox from '@/components/ui/TagCombobox';

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
  isInjured?: boolean;
  injuryNote?: string | null;
  injuryBy?: string | null;
  injuryAt?: string | null;
  screening?: (ScreeningIndicator & { screeningId?: number; overrideAt?: string | null }) | null;
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

  // Selected-athlete state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteFull | null>(null);
  // A PAST screening the clinician chose to view (null = the athlete's latest).
  const [picked, setPicked] = useState<FullScreening | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<'' | 'ind' | 'team'>('');
  // Download errors get their own state (NOT selectedError) — selectedError is
  // checked before the athlete content in the render, so reusing it would blank
  // the whole pane on a failed download.
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Inline "edit events" on the athlete header — set an athlete's disciplines
  // without a fresh HoloMotion import (PATCH /athletes/:id).
  const [editingEvents, setEditingEvents] = useState(false);
  const [eventDraft, setEventDraft] = useState<string[]>([]);
  const [eventsSaving, setEventsSaving] = useState(false);

  // Reset any picked past-screening when the selected athlete changes.
  useEffect(() => { setPicked(null); }, [selectedId]);

  async function saveEvents() {
    if (!selectedAthlete) return;
    setEventsSaving(true); setPdfError(null);
    try {
      const updated = await api.patch<{ disciplines?: string[] }>(
        `/athletes/${selectedAthlete.athleteId}`, { disciplines: eventDraft },
      );
      const next = updated.disciplines ?? eventDraft;
      // Merge only the disciplines so screening/risk data on the loaded athlete
      // is preserved (the PATCH response doesn't carry the screening indicator).
      setSelectedAthlete((cur) => (cur ? { ...cur, disciplines: next } : cur));
      setAthletes((cur) => cur.map((a) => (a.athleteId === selectedAthlete.athleteId ? { ...a, disciplines: next } : a)));
      setEditingEvents(false);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Failed to save events');
    } finally {
      setEventsSaving(false);
    }
  }

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

  // Initial roster load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        const [list, sportsList] = await Promise.all([
          api.get<AthleteListItem[]>('/athletes'),
          api.get<string[]>('/athletes/meta/sports').catch(() => [] as string[]),
        ]);
        if (!cancelled) {
          setAthletes(list);
          setSports(sportsList);
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
      return;
    }
    let cancelled = false;
    setPdfError(null);
    setEditingEvents(false);
    (async () => {
      try {
        setLoadingSelected(true);
        const a = await api.get<AthleteFull>(`/athletes/${selectedId}`);
        if (!cancelled) {
          setSelectedAthlete(a);
          setSelectedError(null);
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

  // Distinct programmes available in the roster (for the filter dropdown)
  const programmes = useMemo(() => {
    const set = new Set<string>();
    athletes.forEach((a) => {
      const p = a.programme ?? a.program;
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [athletes]);

  // Event filter options — the distinct events actually on record for the
  // selected sport (data-driven, so any admin-added event is filterable). The
  // filter only appears once a sport with events is selected.
  const eventOptions = useMemo(() => {
    if (!filterSport) return [];
    const set = new Set<string>();
    athletes.forEach((a) => { if (a.sport === filterSport) (a.disciplines ?? []).forEach((d) => set.add(d)); });
    return Array.from(set).sort();
  }, [athletes, filterSport]);

  // Autocomplete for the events editor: curated seeds for the selected athlete's
  // sport plus every event already used in that sport.
  const eventSuggestions = useMemo(() => {
    if (!selectedAthlete) return [];
    const set = new Set<string>(disciplinesForSport(selectedAthlete.sport));
    athletes.forEach((a) => { if (a.sport === selectedAthlete.sport) (a.disciplines ?? []).forEach((d) => set.add(d)); });
    return Array.from(set).sort();
  }, [selectedAthlete, athletes]);

  // Re-pull the athlete after a clinician sets or clears the risk band, so the
  // hero, the alert banner and the screening history all follow the new
  // effective band in one pass. ClinicianBandOverride owns the PATCH itself.
  async function reloadSelectedAthlete() {
    if (!selectedId) return;
    const a = await api.get<AthleteFull>(`/athletes/${selectedId}`);
    setSelectedAthlete(a);
  }

  // Screening-derived rendering uses `view` — the picked PAST screening if one is
  // selected, else the athlete's latest live data. Identity fields keep using
  // selectedAthlete. `selectedAthlete && view` in the detail guard narrows view.
  const view = picked ?? selectedAthlete;

  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="viewRecords" title="Athlete Dashboard">
      <div className="medical-shell">
        {/* ── Left rail ───────────────────────────────────────────────────── */}
        <aside className="medical-rail">
          <div className="medical-rail-search">
            <input
              id="med-search"
              type="text"
              placeholder="Search name or IC number…"
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
              {/* Event filter appears once a sport with events on record is selected. */}
              {eventOptions.length > 0 && (
                <select
                  value={filterDiscipline}
                  onChange={(e) => setFilterDiscipline(e.target.value)}
                  aria-label="Filter by event"
                >
                  <option value="">All Events</option>
                  {eventOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
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
                  <div className="stat-tile-label">Sports</div>
                  <div className="stat-tile-value">{loadingList ? '…' : sports.length}</div>
                  <div className="stat-tile-delta">On the roster</div>
                </div>
              </div>
            </>
          ) : loadingSelected ? (
            <p className="text-muted">Loading athlete details…</p>
          ) : selectedError ? (
            <div className="alert alert-error">{selectedError}</div>
          ) : selectedAthlete && view ? (
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
                    <div style={{ marginTop: 8 }}>
                      {!editingEvents ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {(selectedAthlete.disciplines ?? []).map((d) => (<span key={d} className="badge-low">{d}</span>))}
                          {(selectedAthlete.disciplines?.length ?? 0) === 0 && (
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>No events</span>
                          )}
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => { setEventDraft(selectedAthlete.disciplines ?? []); setEditingEvents(true); }}
                          >
                            Edit events
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
                          <TagCombobox
                            values={eventDraft}
                            suggestions={eventSuggestions}
                            onChange={setEventDraft}
                            placeholder="Choose an existing event or type a new one"
                            ariaLabel="Events"
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="btn btn-gold btn-sm" onClick={saveEvents} disabled={eventsSaving}>
                              {eventsSaving ? 'Saving…' : 'Save events'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingEvents(false)} disabled={eventsSaving}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
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
                  hero left beside the taller radar). This is the only risk
                  verdict on the dashboard: the ACWR / composite training-load
                  hero was removed 2026-07-16, and Activity Tracking (Module 1
                  — sRPE logging, the sole training-load input) plus the
                  recovery-baseline card and prevention-insight card that
                  depended on it were fully retired 2026-07-20. `lib/risk.ts`
                  is kept (locked decision, MASTER_CLARIFICATIONS §12) but has
                  no live callers left on this page — see
                  docs/fyp/ACWR_REBUILD.md for the model's own history. */}
              <ScreeningDatePicker athleteId={selectedAthlete.athleteId} onPick={setPicked} />

              <OverallRiskBadge screening={view.screening} hero />
              {/* Clinical override acts on the LATEST screening only — hidden
                  while viewing a past screening (you can't re-band history). */}
              {!picked && selectedAthlete.screening?.screeningId && (
                <ClinicianBandOverride
                  screeningId={selectedAthlete.screening.screeningId}
                  systemBand={selectedAthlete.screening.overallBand}
                  effectiveBand={selectedAthlete.screening.effectiveBand}
                  overrideBand={selectedAthlete.screening.overrideBand}
                  overrideNote={selectedAthlete.screening.overrideNote}
                  overrideBy={selectedAthlete.screening.overrideBy}
                  overrideAt={selectedAthlete.screening.overrideAt}
                  onSaved={reloadSelectedAthlete}
                />
              )}
              <InjuryStatusControl
                athleteId={selectedAthlete.athleteId}
                isInjured={selectedAthlete.isInjured}
                injuryNote={selectedAthlete.injuryNote}
                injuryBy={selectedAthlete.injuryBy}
                injuryAt={selectedAthlete.injuryAt}
                onSaved={reloadSelectedAthlete}
              />
              {/* Which regions sit behind an amber/red band. Renders nothing
                  when the athlete is green overall. Sits between the verdict and
                  the radar overview: verdict → why → overview → detail. */}
              <ScreeningAlertBanner
                risks={view.risks}
                sport={selectedAthlete.sport}
                band={view.screening?.effectiveBand}
                audience="staff"
              />

              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Risk Indicators</h2>
                    <span className="card-sub">Lower is better</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 520 }}>
                    <RiskRadar
                      labels={RISK_KEYS.map((k) => RISK_LABEL[k])}
                      values={RISK_KEYS.map((k) => Math.min(30, Math.max(0, view.risks[k] ?? 0)))}
                      thresholds={highThresholdsFor(selectedAthlete.sport)}
                    />
                  </div>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <p style={{ margin: '0 0 10px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      Each spoke is one exercise-risk indicator from the athlete&apos;s
                      HoloMotion screening, on a 0–30 scale. <strong>Closer to the centre
                      is better.</strong>
                    </p>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>
                      The dashed red line is the athlete&apos;s Elevated threshold per
                      region, tightened where the region is sport-critical. Exact
                      values are on the screening panel below; record your own
                      verdict in <strong>Clinical assessment</strong> above once you
                      have examined the athlete.
                    </p>
                  </div>
                </div>
              </div>

              {/* HoloMotion screening — the athlete's latest report read
                  against its thresholds (gauges + indicator strips + muscle
                  flags), embedded here instead of a separate screening page. */}
              <div style={{ marginTop: 20 }}>
                {/* subitems live only on `.screening` (never duplicated onto
                    the flat athlete row), so they're merged in here. */}
                <ScreeningPanel athlete={{ ...selectedAthlete, ...view, subitems: view.screening?.subitems }} showTrainingFocus={false} />
              </div>

              {/* Report-to-report progress — the on-screen counterpart of the
                  individual PDF's progress section. */}
              <div style={{ marginTop: 20 }}>
                <ScreeningHistory athleteId={selectedAthlete.athleteId} />
              </div>

              {/* Body map */}
              <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Muscle Assessment Map</h2>
                    <span className="card-sub">L = left · R = right · B = both</span>
                  </div>
                </div>
                <BodyMap
                  myodynamia={view.myodynamia ?? []}
                  tension={view.tension ?? []}
                  subitems={view.screening?.subitems}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  );
}
