'use client';

// The cohort slicer shared by the two admin analytics pages — Screening
// Analytics (the population's current state) and Programme Activity (how much
// screening is happening and which way scores move).
//
// Shared rather than copied so the two pages cannot drift into slicing the
// population differently: "by sport / by gender / by age group" is one
// vocabulary (Dr Thung, 2026-04-24), and a comparison between the two pages is
// only meaningful if both mean the same thing by "Badminton · Female".

import { useMemo, useState } from 'react';
import { INDICATORS } from '@/lib/screeningAlerts';

// The three slicing vocabularies come from shared/facts.js (generated into both
// packages) — they are the Athlete columns' own enums and the report's own age
// buckets, so a dropdown here can no longer offer a value the database rejects
// or a band the PDF prints differently. The dropdowns used to disagree with the
// report ("18–23 (junior)" on screen vs "21-25" in print). ASCII hyphens,
// because pdfkit's Helvetica has no en-dash.
import { GENDERS, PROGRAMMES, AGE_GROUPS as AGE_BANDS } from '@/lib/shared/facts';
import type { AgeGroup } from '@/lib/shared/facts';

export { GENDERS, PROGRAMMES };

// "All ages" is a FILTER option, not an age band — which is why it is added
// here rather than living in the shared source the report also reads.
export const AGE_GROUPS: AgeGroup[] = [{ label: 'All ages' }, ...AGE_BANDS];

// The focusable indicators, in the canonical order. Read from INDICATORS so
// the LDH exclusion is inherited — Lumbar Disc Herniation is stored but never
// shown, and must never become selectable here either.
export const FOCUS_REGIONS = INDICATORS.map((i) => ({ key: i.key as string, label: i.label }));

const IconSliders = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

export interface CohortFilterState {
  // POPULATION — who is in the picture.
  sport: string; setSport: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  programme: string; setProgramme: (v: string) => void;
  ageGroupIndex: number; setAgeGroupIndex: (v: number) => void;
  discipline: string; setDiscipline: (v: string) => void;
  // FOCUS — what the picture is about. Does NOT narrow the population.
  region: string; setRegion: (v: string) => void;
  /** Query string for the analytics endpoints, without a leading '?'. */
  query: string;
  active: boolean;
  reset: () => void;
}

export function useCohortFilters(): CohortFilterState {
  const [sport, setSport] = useState('');
  const [gender, setGender] = useState('');
  const [programme, setProgramme] = useState('');
  const [ageGroupIndex, setAgeGroupIndex] = useState(0);
  const [discipline, setDiscipline] = useState('');
  const [region, setRegion] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (sport) p.set('sport', sport);
    if (gender) p.set('gender', gender);
    if (programme) p.set('program', programme);
    if (discipline) p.set('discipline', discipline);
    const ag = AGE_GROUPS[ageGroupIndex];
    if (ag.min !== undefined) p.set('ageMin', String(ag.min));
    if (ag.max !== undefined) p.set('ageMax', String(ag.max));
    if (region) p.set('region', region);
    return p.toString();
  }, [sport, gender, programme, ageGroupIndex, discipline, region]);

  return {
    sport, setSport, gender, setGender, programme, setProgramme, ageGroupIndex, setAgeGroupIndex,
    discipline, setDiscipline, region, setRegion,
    query,
    active: Boolean(sport || gender || programme || ageGroupIndex || discipline || region),
    reset: () => {
      setSport(''); setGender(''); setProgramme(''); setAgeGroupIndex(0); setDiscipline(''); setRegion('');
    },
  };
}

export default function CohortFilters({ f, sports, disciplines = [], showFocus = false, note }: {
  f: CohortFilterState;
  sports: string[];
  /** (sport, discipline) pairs on record; narrowed to the selected sport. */
  disciplines?: Array<{ sport: string; discipline: string }>;
  /** Show the region focus. Only pages that render focused panels should. */
  showFocus?: boolean;
  /** One line under the controls saying what these filters do on THIS page. */
  note?: string;
}) {
  // Only offer events belonging to the selected sport — a badminton event in a
  // swimming-filtered view would always return nobody.
  const events = Array.from(new Set(
    disciplines.filter((d) => !f.sport || d.sport === f.sport).map((d) => d.discipline),
  )).sort();

  // Collapsed by default: the common view is the whole institute, and the
  // controls were pushing the first chart below the fold on every visit.
  const [open, setOpen] = useState(false);

  // WHY THE CHIPS ARE NOT OPTIONAL.
  //
  // Hiding the controls is safe; hiding the STATE is not. Every number on these
  // pages is cohort-relative, so a forgotten "Sport: Badminton" silently scopes
  // the distribution, the scatter, the asymmetry counts and every KPI tile to 20
  // athletes while the page still reads as institution-wide. The chips are what
  // make collapsing the panel safe, and each one clears its own filter.
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (f.sport) chips.push({ key: 'sport', label: `Sport: ${f.sport}`, clear: () => { f.setSport(''); f.setDiscipline(''); } });
  if (f.gender) chips.push({ key: 'gender', label: f.gender, clear: () => f.setGender('') });
  if (f.programme) chips.push({ key: 'programme', label: f.programme, clear: () => f.setProgramme('') });
  if (f.ageGroupIndex) chips.push({ key: 'age', label: AGE_GROUPS[f.ageGroupIndex].label, clear: () => f.setAgeGroupIndex(0) });
  if (f.discipline) chips.push({ key: 'event', label: f.discipline, clear: () => f.setDiscipline('') });

  // The focus is deliberately NOT in that list or that count. It removes nobody
  // from the picture — it changes which measure the picture is about — and the
  // expanded panel separates it for the same reason. Collapsing the two into one
  // "3 filters" badge would flatten the distinction.
  const focusLabel = f.region ? (FOCUS_REGIONS.find((r) => r.key === f.region)?.label ?? f.region) : null;

  return (
    <div className={`card cohort-filters${open ? ' is-open' : ''}`} style={{ marginBottom: 20 }}>
      <div className="cohort-filters-bar">
        <button
          type="button"
          className="btn btn-outline btn-sm cohort-filters-toggle"
          aria-expanded={open}
          aria-controls="cohort-filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <IconSliders />
          Filters
          {chips.length > 0 && <span className="cohort-filters-count">{chips.length}</span>}
        </button>

        <div className="cohort-filters-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="audit-chip"
              onClick={c.clear}
              title={`Remove this filter — ${c.label}`}
            >
              {c.label} ×
            </button>
          ))}
          {focusLabel && (
            <button
              type="button"
              className="audit-chip audit-chip--focus"
              onClick={() => f.setRegion('')}
              title="Clear the region focus. This is not a population filter — it changes which measure the panels read."
            >
              Focus: <strong>{focusLabel}</strong> ×
            </button>
          )}
          {(chips.length > 0 || focusLabel) && (
            <button type="button" className="cohort-filters-clear" onClick={f.reset}>Clear all</button>
          )}
          {chips.length === 0 && !focusLabel && (
            <span className="cohort-filters-hint">Showing the whole institute</span>
          )}
        </div>
      </div>

      <div id="cohort-filter-panel" hidden={!open}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
        <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
          <label>Sport</label>
          <select value={f.sport} onChange={(e) => { f.setSport(e.target.value); f.setDiscipline(''); }}>
            <option value="">All sports</option>
            {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 120, marginBottom: 0 }}>
          <label>Gender</label>
          <select value={f.gender} onChange={(e) => f.setGender(e.target.value)}>
            <option value="">All</option>
            {GENDERS.map((g) => (<option key={g} value={g}>{g}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
          <label>Programme</label>
          <select value={f.programme} onChange={(e) => f.setProgramme(e.target.value)}>
            <option value="">All</option>
            {PROGRAMMES.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
          <label>Age group</label>
          <select value={f.ageGroupIndex} onChange={(e) => f.setAgeGroupIndex(Number(e.target.value))}>
            {AGE_GROUPS.map((g, i) => (<option key={g.label} value={i}>{g.label}</option>))}
          </select>
        </div>
        {events.length > 0 && (
          <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
            <label>Event</label>
            <select value={f.discipline} onChange={(e) => f.setDiscipline(e.target.value)}>
              <option value="">All events</option>
              {events.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={f.reset}>Reset</button>
      </div>

      {/* The region focus is a DIFFERENT kind of control and is separated so it
          doesn't read as another population filter. It removes nobody from the
          picture; it changes which measure the picture is about. */}
      {showFocus && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 190, marginBottom: 0 }}>
            <label>Focus on a body region</label>
            <select value={f.region} onChange={(e) => f.setRegion(e.target.value)}>
              <option value="">No focus — show all regions</option>
              {FOCUS_REGIONS.map((r) => (<option key={r.key} value={r.key}>{r.label}</option>))}
            </select>
          </div>
          <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', paddingBottom: 8, flex: '1 1 320px' }}>
            {f.region
              ? 'Focused: every panel below re-reads this cohort through one indicator, split by sport, gender, age and programme. No athlete is removed — that is what makes the comparison meaningful.'
              : 'Optional. Picking a region answers "which group carries this problem?" — for example, focus Knee and compare across gender.'}
          </div>
        </div>
      )}

      {note && <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 10 }}>{note}</div>}
      </div>
    </div>
  );
}
