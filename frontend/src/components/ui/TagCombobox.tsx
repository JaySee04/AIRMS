'use client';

// A small multi-select combobox: shows selected values as removable chips and,
// on focus/typing, an in-UI styled dropdown to pick an existing value or add a
// new typed one. Replaces the browser-native <datalist>, which renders an
// unstyled popup that clashes with the app and can overlap nearby controls.

import { useEffect, useRef, useState } from 'react';

interface Props {
  values: string[];
  suggestions: string[];               // candidate pool; already-selected are filtered out
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export default function TagCombobox({ values, suggestions, onChange, placeholder, ariaLabel }: Props) {
  const [input, setInput] = useState('');
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

  const q = input.trim().toLowerCase();
  const filtered = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()) && s.toLowerCase().includes(q));
  const exists = q.length > 0 && (
    suggestions.some((s) => s.toLowerCase() === q) || values.some((v) => v.toLowerCase() === q)
  );
  // Rows: an "add new" row (when the typed value is novel) then the matches.
  const rows: Array<{ type: 'add' | 'existing'; value: string }> = [
    ...(q.length > 0 && !exists ? [{ type: 'add' as const, value: input.trim() }] : []),
    ...filtered.map((s) => ({ type: 'existing' as const, value: s })),
  ];

  function add(value: string) {
    const v = value.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setInput('');
    setActive(0);
    inputRef.current?.focus();
  }
  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, rows.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[active]) add(rows[active].value);
      else if (input.trim()) add(input);
    } else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Backspace' && !input && values.length) { remove(values[values.length - 1]); }
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <div
        className={`combobox-control${open ? ' is-open' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {values.map((v) => (
          <span key={v} className="combobox-chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); remove(v); }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="combobox-input"
          value={input}
          placeholder={values.length ? '' : placeholder}
          aria-label={ariaLabel}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && rows.length > 0 && (
        <div className="combobox-menu" role="listbox">
          {rows.map((row, i) => (
            <div
              key={`${row.type}:${row.value}`}
              role="option"
              aria-selected={i === active}
              className={`combobox-option${i === active ? ' is-active' : ''}${row.type === 'add' ? ' combobox-option-new' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); add(row.value); }}
            >
              {row.type === 'add'
                ? <span>Add &ldquo;{row.value}&rdquo;</span>
                : <><span>{row.value}</span><span className="text-muted" style={{ fontSize: '0.72rem' }}>existing</span></>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
