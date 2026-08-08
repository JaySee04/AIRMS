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

export const GENDERS = ['Male', 'Female'];
export const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];
// Boundaries and labels MUST match backend/src/utils/cohortFocus.js AGE_GROUPS:
// the dropdown here and the age rows in the focus breakdown and the PDF are the
// same buckets, and used to disagree ("18–23 (junior)" on screen vs "21-25" in
// print). ASCII hyphens, because pdfkit's Helvetica has no en-dash.
export const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18-23 (junior)', min: 18, max: 23 },
  { label: '24-29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

// The focusable indicators, in the canonical order. Read from INDICATORS so
// the LDH exclusion is inherited — Lumbar Disc Herniation is stored but never
// shown, and must never become selectable here either.
export const FOCUS_REGIONS = INDICATORS.map((i) => ({ key: i.key as string, label: i.label }));

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

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
          <div className="text-muted" style={{ fontSize: '0.78rem', paddingBottom: 8, flex: '1 1 320px' }}>
            {f.region
              ? 'Focused: every panel below re-reads this cohort through one indicator, split by sport, gender, age and programme. No athlete is removed — that is what makes the comparison meaningful.'
              : 'Optional. Picking a region answers "which group carries this problem?" — for example, focus Knee and compare across gender.'}
          </div>
        </div>
      )}

      {note && <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>{note}</div>}
    </div>
  );
}
