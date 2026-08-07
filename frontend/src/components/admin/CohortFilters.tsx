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

export const GENDERS = ['Male', 'Female'];
export const PROGRAMMES = ['PODIUM', 'PELAPIS', 'OTHERS'];
export const AGE_GROUPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'All ages' },
  { label: 'Under 18', max: 17 },
  { label: '18–23 (junior)', min: 18, max: 23 },
  { label: '24–29 (senior)', min: 24, max: 29 },
  { label: '30+ (veteran)', min: 30 },
];

export interface CohortFilterState {
  sport: string; setSport: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  programme: string; setProgramme: (v: string) => void;
  ageGroupIndex: number; setAgeGroupIndex: (v: number) => void;
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

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (sport) p.set('sport', sport);
    if (gender) p.set('gender', gender);
    if (programme) p.set('program', programme);
    const ag = AGE_GROUPS[ageGroupIndex];
    if (ag.min !== undefined) p.set('ageMin', String(ag.min));
    if (ag.max !== undefined) p.set('ageMax', String(ag.max));
    return p.toString();
  }, [sport, gender, programme, ageGroupIndex]);

  return {
    sport, setSport, gender, setGender, programme, setProgramme, ageGroupIndex, setAgeGroupIndex,
    query,
    active: Boolean(sport || gender || programme || ageGroupIndex),
    reset: () => { setSport(''); setGender(''); setProgramme(''); setAgeGroupIndex(0); },
  };
}

export default function CohortFilters({ f, sports, note }: {
  f: CohortFilterState;
  sports: string[];
  /** One line under the controls saying what these filters do on THIS page. */
  note?: string;
}) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
          <label>Sport</label>
          <select value={f.sport} onChange={(e) => f.setSport(e.target.value)}>
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
        <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={f.reset}>Reset</button>
      </div>
      {note && <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>{note}</div>}
    </div>
  );
}
