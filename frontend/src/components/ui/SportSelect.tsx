'use client';

// Dedicated, in-app single-select sport picker: a styled, theme-aware dropdown
// that filters a sports list as you type. Replaces the browser-native
// <datalist> (unstyled OS popup that can't follow the app theme), matching
// AthleteSearchSelect. Controlled — `value` is the current sport string and
// `onChange` fires on both typing and picking. Reuses the shared .combobox-*
// styles.

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  sports: string[];
  value: string;
  onChange: (sport: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export default function SportSelect({ sports, value, onChange, placeholder = 'Search sports…', ariaLabel = 'Sport' }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? sports.filter((s) => s.toLowerCase().includes(q)) : sports;
    return list.slice(0, 60);
  }, [sports, value]);

  function choose(s: string) {
    onChange(s);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
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
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value.length > 0 && (
          <button type="button" className="combobox-clear" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); onChange(''); inputRef.current?.focus(); setOpen(true); }}>×</button>
        )}
        <span className="combobox-caret" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </div>
      {open && (
        <div className="combobox-menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="combobox-empty">No sport matches “{value.trim()}”.</div>
          ) : (
            filtered.map((s, i) => (
              <div
                key={s}
                role="option"
                aria-selected={s === value}
                className={`combobox-option${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              >
                {s}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
