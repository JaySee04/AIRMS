'use client';

// A dedicated, in-app single-select athlete picker: a styled, theme-aware
// dropdown that filters a roster by name (or IC number) as you type, shows
// name + IC · sport per row, and reports the chosen athlete's key. Replaces
// the browser-native <datalist>, which renders an unstyled OS popup that clashes
// with the app and can't follow the light/dark theme. Reuses the shared
// .combobox-* styles (same system as TagCombobox).

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveAthleteId } from '@/lib/name';
import { searchAthletes } from '@/lib/athleteSearch';
import MarkedText from '@/components/ui/MarkedText';

export interface PickableAthlete { athleteId: string; name: string; sport?: string; }

interface Props {
  athletes: PickableAthlete[];
  onSelect: (athleteId: string) => void; // '' when cleared / no confirmed pick
  placeholder?: string;
  ariaLabel?: string;
}

export default function AthleteSearchSelect({ athletes, onSelect, placeholder = 'Search by name…', ariaLabel = 'Athlete' }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<PickableAthlete | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Ranked by the shared matcher, so this box and the medical rail agree about
  // what a query means: word order is free, an IC can carry its dashes, and an
  // exact IC sorts to the top. Capped at 60 rows for the popup's sake.
  const hits = useMemo(() => searchAthletes(athletes, input).slice(0, 60), [athletes, input]);

  function choose(a: PickableAthlete) {
    setPicked(a);
    setInput(a.name);
    setOpen(false);
    onSelect(a.athleteId);
  }

  function clear() {
    setPicked(null);
    setInput('');
    onSelect('');
    inputRef.current?.focus();
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && hits[active]) { choose(hits[active].athlete); return; }
      // No highlighted row: accept a typed exact-name / IC-number match.
      const id = resolveAthleteId(input, athletes);
      const hit = athletes.find((a) => a.athleteId === id);
      if (hit) choose(hit);
    } else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <div
        className={`combobox-control combobox-control--select${open ? ' is-open' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <input
          ref={inputRef}
          className="combobox-input"
          value={input}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(0);
            if (picked) { setPicked(null); onSelect(''); } // editing invalidates the pick
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {picked || input ? (
          <button type="button" className="combobox-clear" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); clear(); }}>×</button>
        ) : null}
        <span className="combobox-caret" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </div>
      {open && (
        <div className="combobox-menu" role="listbox">
          {hits.length === 0 ? (
            <div className="combobox-empty">No athlete matches “{input.trim()}”.</div>
          ) : (
            hits.map((h, i) => (
              <div
                key={h.athlete.athleteId}
                role="option"
                aria-selected={i === active}
                className={`combobox-option combobox-option--stacked${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(h.athlete); }}
              >
                <span className="combobox-opt-name">
                  <MarkedText segments={h.nameSegments} fallback={h.athlete.name} />
                  {/* Picking the wrong one of two same-named athletes here
                      attaches a screening to another person's record, so the
                      warning belongs on the row being clicked. */}
                  {h.ambiguous && <span className="athlete-row-dupe">shared name</span>}
                </span>
                <span className="combobox-opt-sub">
                  <MarkedText segments={h.idSegments} fallback={h.athlete.athleteId} />
                  {h.athlete.sport ? ` · ${h.athlete.sport}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
