'use client';

// A dedicated, in-app single-select athlete picker: a styled, theme-aware
// dropdown that filters a roster by name (or IC number) as you type, shows
// name + IC · sport per row, and reports the chosen athlete's key. Replaces
// the browser-native <datalist>, which renders an unstyled OS popup that clashes
// with the app and can't follow the light/dark theme. Reuses the shared
// .combobox-* styles (same system as TagCombobox).

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveAthleteId } from '@/lib/name';

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

  // Filter by name or ATH id; show the whole roster when the box is empty.
  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    const list = q
      ? athletes.filter((a) => a.name.toLowerCase().includes(q) || a.athleteId.toLowerCase().includes(q))
      : athletes;
    return list.slice(0, 60);
  }, [athletes, input]);

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
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[active]) { choose(filtered[active]); return; }
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
          {filtered.length === 0 ? (
            <div className="combobox-empty">No athlete matches “{input.trim()}”.</div>
          ) : (
            filtered.map((a, i) => (
              <div
                key={a.athleteId}
                role="option"
                aria-selected={i === active}
                className={`combobox-option combobox-option--stacked${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(a); }}
              >
                <span className="combobox-opt-name">{a.name}</span>
                <span className="combobox-opt-sub">{a.athleteId}{a.sport ? ` · ${a.sport}` : ''}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
