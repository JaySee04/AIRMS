'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import OverallRiskBadge, { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import ClinicianBandOverride from '@/components/dashboard/ClinicianBandOverride';
import type { AthleteRisks } from '@/lib/screeningAlerts';
import { INSTRUMENT_BANDS, RADAR_LABELS, highThresholdsFor, riskBand, riskRadarSeries } from '@/lib/screeningAlerts';

// Chart.js and the body-map path data are the heaviest client code on this
// page and render nothing on the server anyway — split them out so the
// roster/detail shell paints without them.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), { ssr: false, loading: () => <div style={{ minHeight: 300 }} /> });
const RiskRadar = dynamic(() => import('@/components/dashboard/RiskRadar'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });
import ScreeningAlertBanner from '@/components/dashboard/ScreeningAlertBanner';
import ScreeningHistory from '@/components/dashboard/ScreeningHistory';
import ScreeningPanel from '@/components/dashboard/ScreeningPanel';
import SportContext from '@/components/dashboard/SportContext';
import ScreeningDatePicker, { FullScreening } from '@/components/dashboard/ScreeningDatePicker';
import InjuryStatusControl from '@/components/dashboard/InjuryStatusControl';
import { api } from '@/lib/api';
import HeadlineScores from '@/components/dashboard/HeadlineScores';
import { searchAthletes } from '@/lib/athleteSearch';
import MarkedText from '@/components/ui/MarkedText';
import { disciplinesForSport } from '@/lib/disciplines';
import { getInitials } from '@/lib/name';
import TagCombobox from '@/components/ui/TagCombobox';

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
  // Already on the wire from GET /athletes; declared so the landing pane can
  // summarise the roster without a second request. Null on an athlete who has
  // never been screened, which is how "not yet screened" is counted.
  injuryRiskIndex?: number | null;
  overallActivityScore?: number | null;
  isInjured?: boolean;
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

  // Dropdowns narrow the POPULATION; the search box then ranks what is left.
  // In that order, so relevance is judged against the athletes actually on
  // offer and "ambiguous" reflects the rows a clinician can really mis-pick.
  const hits = useMemo(() => {
    const pool = athletes.filter((a) => {
      if (filterSport && a.sport !== filterSport) return false;
      const prog = a.programme ?? a.program;
      if (filterProgramme && prog !== filterProgramme) return false;
      if (filterGender && a.gender !== filterGender) return false;
      if (filterDiscipline && !(a.disciplines ?? []).includes(filterDiscipline)) return false;
      return true;
    });
    return searchAthletes(pool, search);
  }, [athletes, search, filterSport, filterProgramme, filterGender, filterDiscipline]);

  const activeFilters = [filterSport, filterProgramme, filterGender, filterDiscipline].filter(Boolean).length;
  function clearFilters() {
    setFilterSport(''); setFilterProgramme(''); setFilterGender(''); setFilterDiscipline('');
  }

  // Keyboard cursor into the result list. A clinician typing an IC should not
  // have to leave the keyboard to open the athlete they just identified.
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Any change to the result set invalidates the cursor's position in it.
  useEffect(() => { setCursor(0); }, [search, filterSport, filterProgramme, filterGender, filterDiscipline]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // "/" focuses the search from anywhere on the page — the convention users
  // already know from GitHub, Slack and Gmail — but never while they are typing
  // into something else.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter opens the highlighted athlete. With one hit that is simply "the
      // one you found"; with several it is the top-ranked one, which is why
      // ranking had to be right before this shortcut could exist.
      const hit = hits[cursor];
      if (hit) { e.preventDefault(); setSelectedId(hit.athlete.athleteId); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (search) setSearch('');
      else searchRef.current?.blur();
    }
  }

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

  // What the landing pane shows before an athlete is chosen. The copy promised
  // "quick-access groups below" and there were none — two stat tiles and then
  // most of a screen of nothing.
  //
  // Everything here is a FACT already on the roster payload. Deliberately no
  // cohort band: that verdict is not on this response, and inventing a second
  // one here is how a landing pane comes to contradict the hero the clinician
  // sees one click later. The one score shown is HoloMotion's printed Exercise
  // Risks, banded by the SAME riskBand/INSTRUMENT_BANDS the screening panel
  // uses for that gauge, so the two cannot disagree.
  const roster = useMemo(() => {
    const screened = athletes.filter((a) => a.injuryRiskIndex != null);
    const bySport = Array.from(
      athletes.reduce((m, a) => m.set(a.sport, (m.get(a.sport) ?? 0) + 1), new Map<string, number>()),
    ).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    const topRisk = [...screened]
      .sort((a, b) => (b.injuryRiskIndex as number) - (a.injuryRiskIndex as number))
      .slice(0, 6);
    // Institute averages for the headline, over SCREENED athletes only — an
    // athlete with no screening has no score, and counting them as zero would
    // drag both figures toward a number nobody measured.
    const mean = (pick: (a: AthleteListItem) => number | null | undefined) => {
      const vs = screened.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null;
    };
    return {
      screened: screened.length,
      unscreened: athletes.length - screened.length,
      injured: athletes.filter((a) => a.isInjured).length,
      bySport,
      topRisk,
      avgTotal: mean((a) => a.overallActivityScore),
      avgRisks: mean((a) => a.injuryRiskIndex),
    };
  }, [athletes]);

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
    // Declaring an athlete injured rebuilds their cohort's norm, which re-scores
    // EVERY athlete in it — so the roster's bands beside us are stale too, not
    // just this one's. Refreshed quietly; a failure here must not surface as if
    // the save failed, because it did not.
    try {
      setAthletes(await api.get<AthleteListItem[]>('/athletes'));
    } catch { /* list keeps its current values until the next load */ }
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
            <div className="rail-search-box">
              <input
                id="med-search"
                ref={searchRef}
                type="search"
                placeholder="Search name or IC…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
                autoComplete="off"
                className="medical-rail-search-input"
                aria-label="Search athletes by name or IC number"
                aria-describedby="med-search-help"
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="med-rail-list"
                aria-activedescendant={hits[cursor] ? `athlete-opt-${hits[cursor].athlete.athleteId}` : undefined}
              />
              {search ? (
                <button
                  type="button"
                  className="rail-search-clear"
                  aria-label="Clear search"
                  onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                >
                  ×
                </button>
              ) : (
                // The shortcut is only advertised while it is the thing to do;
                // once there is text in the box the clear button takes the slot.
                <kbd className="rail-search-kbd" aria-hidden>/</kbd>
              )}
            </div>
            <p id="med-search-help" className="sr-only">
              Type a name in any order, or an IC number with or without dashes.
              Use the up and down arrows to move through results and Enter to open one.
            </p>
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
              <span>
                {loadingList
                  ? 'Loading…'
                  : `${hits.length} athlete${hits.length === 1 ? '' : 's'}${search ? ' matched' : ''}`}
              </span>
              {/* The dropdowns sit above and read "All Sports" whether or not
                  they are doing anything, so an empty rail looks like an empty
                  roster. This says how many filters are actually narrowing it
                  and undoes them in one click. */}
              {activeFilters > 0 && (
                <button type="button" className="rail-filter-chip" onClick={clearFilters}>
                  {activeFilters} filter{activeFilters === 1 ? '' : 's'} · clear
                </button>
              )}
            </div>
          </div>

          <div className="medical-rail-list" id="med-rail-list" ref={listRef} role="listbox" aria-label="Athletes">
            {loadingList ? (
              <p className="text-muted" style={{ padding: 12 }}>Loading roster…</p>
            ) : listError ? (
              <div className="alert alert-error">{listError}</div>
            ) : hits.length === 0 ? (
              // Say which of the two things emptied the list, because the fix
              // differs: retype the name, or drop a filter.
              <div className="rail-empty">
                <p className="text-muted" style={{ margin: 0 }}>
                  {search ? <>No athlete matches <strong>{search}</strong>.</> : 'No athletes match your filters.'}
                </p>
                {search && activeFilters > 0 && (
                  <p className="text-muted" style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                    {activeFilters} filter{activeFilters === 1 ? ' is' : 's are'} also narrowing the roster.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {search && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearch(''); searchRef.current?.focus(); }}>
                      Clear search
                    </button>
                  )}
                  {activeFilters > 0 && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>Clear filters</button>
                  )}
                </div>
              </div>
            ) : (
              hits.map((h, i) => {
                const a = h.athlete;
                return (
                  <button
                    key={a.athleteId}
                    id={`athlete-opt-${a.athleteId}`}
                    data-idx={i}
                    type="button"
                    className={`athlete-row${selectedId === a.athleteId ? ' active' : ''}${i === cursor && search ? ' cursor' : ''}`}
                    onClick={() => setSelectedId(a.athleteId)}
                    onMouseEnter={() => setCursor(i)}
                    role="option"
                    aria-selected={selectedId === a.athleteId}
                  >
                    <span className="athlete-row-avatar">{getInitials(a.name)}</span>
                    <span className="athlete-row-info">
                      <span className="athlete-row-name">
                        <MarkedText segments={h.nameSegments} fallback={a.name} />
                        {/* Two athletes on this roster can share a name and not a
                            record. Marking the row is the only thing standing
                            between the clinician and the wrong person's scores. */}
                        {h.ambiguous && (
                          <span className="athlete-row-dupe" title="Another athlete in these results has the same name — check the IC">
                            shared name
                          </span>
                        )}
                      </span>
                      <span className="athlete-row-meta">
                        {a.sport ?? '—'} · <MarkedText segments={h.idSegments} fallback={a.athleteId} />
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Right pane ──────────────────────────────────────────────────── */}
        <section className="medical-pane">
          {!selectedId ? (
            /* Empty state — clinician's natural entry points */
            <>
              {/* The same two figures the admin and coach dashboards open on, so
                  every role starts from one headline (JC, 2026-09-04). */}
              {!loadingList && roster.screened > 0 && (
                <HeadlineScores
                  subject="Institute"
                  totalScore={roster.avgTotal}
                  exerciseRisks={roster.avgRisks}
                  scope={`averaged over ${roster.screened} screened athlete`
                    + `${roster.screened === 1 ? '' : 's'}`
                    + `${roster.unscreened ? ` · ${roster.unscreened} never screened` : ''}`}
                />
              )}

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
                  <div className="stat-tile-delta">{loadingList ? '' : `across ${sports.length} sports`}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Screened</div>
                  <div className="stat-tile-value">{loadingList ? '…' : roster.screened}</div>
                  <div className="stat-tile-delta">have a HoloMotion report</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Not yet screened</div>
                  <div className="stat-tile-value">{loadingList ? '…' : roster.unscreened}</div>
                  <div className="stat-tile-delta">need a first assessment</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Flagged injured</div>
                  <div className="stat-tile-value">{loadingList ? '…' : roster.injured}</div>
                  <div className="stat-tile-delta">excluded from cohort norms</div>
                </div>
              </div>

              {roster.bySport.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <h3 className="quick-heading">Jump to a squad</h3>
                  <div className="quick-chips">
                    {roster.bySport.map(([sport, n]) => (
                      <button
                        key={sport}
                        type="button"
                        className="quick-chip"
                        onClick={() => { setFilterSport(sport); searchRef.current?.focus(); }}
                      >
                        {sport}<span className="quick-chip-n">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {roster.topRisk.length > 0 && (
                <div className="card">
                  <h3 className="quick-heading">Highest exercise risk</h3>
                  <p className="text-muted quick-sub">
                    HoloMotion&rsquo;s own printed Exercise Risks score, highest first — the
                    instrument&rsquo;s reading, not the cohort verdict. Open an athlete for that.
                  </p>
                  <ul className="quick-list">
                    {roster.topRisk.map((a) => {
                      const band = riskBand(a.injuryRiskIndex as number, INSTRUMENT_BANDS);
                      return (
                        <li key={a.athleteId}>
                          <button type="button" onClick={() => setSelectedId(a.athleteId)}>
                            <span className="quick-list-name">{a.name}</span>
                            <span className="quick-list-meta">{a.sport}</span>
                            <span
                              className="quick-list-score"
                              style={{ background: band.color, color: band.ink }}
                            >
                              {a.injuryRiskIndex} · {band.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
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
                    fontSize: 'var(--fs-xl)', fontWeight: 600,
                  }}>
                    {getInitials(selectedAthlete.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0 }}>{selectedAthlete.name}</h2>
                    <div className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>
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
                            <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>No events</span>
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
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-gold btn-sm" onClick={saveEvents} disabled={eventsSaving}>
                              {eventsSaving ? 'Saving…' : 'Save events'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingEvents(false)} disabled={eventsSaving}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* flexShrink:0 alongside flexWrap is self-contradictory — it may wrap but
                      refuses to shrink, so the row held its content width and pushed
                      past the card on a phone. */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
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

              {/* `picked` is non-null only when a PAST screening is chosen, so it
                  is exactly the signal the shared copy needs to stop speaking in
                  the present tense. */}
              <OverallRiskBadge screening={view.screening} hero audience="staff" historical={!!picked} />
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
                historical={!!picked}
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
                      labels={RADAR_LABELS}
                      values={riskRadarSeries(view.risks)}
                      thresholds={highThresholdsFor(selectedAthlete.sport)}
                    />
                  </div>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-md)', lineHeight: 1.5 }}>
                      Each spoke is one exercise-risk indicator from the athlete&apos;s
                      HoloMotion screening, on a 0–30 scale. <strong>Closer to the centre
                      is better.</strong>
                    </p>
                    <p className="text-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
                      The dashed red line is the athlete&apos;s Elevated threshold per
                      region, tightened where the region is sport-critical. Exact
                      values are on the screening panel below
                      {/* Clinical assessment is bound to the LATEST screening and is
                          hidden while a past one is displayed, so pointing at it
                          here would name a card that is not on screen. */}
                      {picked ? (
                        <>; this is the screening selected above, not the athlete&apos;s current
                          position — switch back to the latest to record an assessment.
                        </>
                      ) : (
                        <>; record your own verdict in <strong>Clinical assessment</strong> above
                          once you have examined the athlete.
                        </>
                      )}
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
                <ScreeningPanel athlete={{ ...selectedAthlete, ...view, subitems: view.screening?.subitems }} showTrainingFocus={false} historical={!!picked} />
              </div>

              {/* The athlete against their own squad. Restores the sport-level
                  comparison the medical view lost with the injury log, from
                  screening data instead (Dr Thung 2026-04-24, 13:00). */}
              <div style={{ marginTop: 20 }}>
                <SportContext athleteId={selectedAthlete.athleteId} />
              </div>

              {/* Report-to-report progress — the on-screen counterpart of the
                  individual PDF's progress section. */}
              <div style={{ marginTop: 20 }}>
                {/* Medical/admin only — the athlete and coach views mount the
                    same component without this, so they read history but
                    cannot change which screening counts as current. */}
                <ScreeningHistory athleteId={selectedAthlete.athleteId} canReinstate />
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
                  historical={!!picked}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  );
}
