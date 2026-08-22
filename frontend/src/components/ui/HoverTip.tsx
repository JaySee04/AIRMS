'use client';

// The hover/focus tooltip for the data graphics (body map, charts).
//
// Both surfaces used SVG <title>, which hands the job to the browser: the box is
// drawn by the OS in the OS's own styling, so it followed neither the theme nor
// the design scale, and on a dark dashboard a Chrome tooltip is simply a
// different product's furniture sitting on the page.
//
// It also flattened content that has structure. The body map's text is already
// multi-line (a muscle can be weak AND tight, and several aliased muscles can
// share one shape), and a native tooltip renders that as a cramped grey block.
// Here a "name — state" line becomes a name with a coloured state chip that
// matches the figure's own legend, so the reader sees the finding instead of
// parsing a sentence.
//
// WCAG 1.4.13 (Content on Hover or Focus) is the reason for the shape of this
// API. The native tooltip is dismissible, hoverable and persistent for free; a
// hand-rolled one has to earn those. So: Escape dismisses, the tip is
// pointer-events:none so it can never eat the hover that spawned it, and it
// opens on FOCUS as well as hover, because both graphics are keyboard-navigable
// and a mouse-only tooltip would be a regression for the people who most need
// the text.
//
// The accessible name is NOT this component's job. Both callers already put an
// aria-label on the interactive element, which is what a screen reader reads;
// removing <title> therefore costs nothing there, and this tip is decorative to
// assistive tech by design (aria-hidden) rather than a second, competing
// announcement of the same words.

import { useCallback, useEffect, useState } from 'react';

export type TipState = { lines: string[]; x: number; y: number } | null;

/** A "Name — state" line, split so the state can be drawn as a chip. */
const STATE_LINE = /^(.*?)\s+—\s+(weak \+ tight|weak|tight)$/;

/** Which legend colour a state chip takes. Matches the body map's own fills. */
const STATE_CLASS: Record<string, string> = {
  weak: 'viz-tip-chip--weak',
  tight: 'viz-tip-chip--tight',
  'weak + tight': 'viz-tip-chip--both',
};

export function useHoverTip() {
  const [tip, setTip] = useState<TipState>(null);

  // Dismissible without moving the pointer (WCAG 1.4.13). Bound only while a tip
  // is open, so the page has no idle key listener.
  useEffect(() => {
    if (!tip) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTip(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tip]);

  // `host` is the positioned wrapper the tip is placed inside; coordinates are
  // resolved against it so the tip travels with the layout rather than the
  // viewport.
  const show = useCallback((lines: string[], host: HTMLElement | null, clientX: number, clientY: number) => {
    if (!host || !lines.length) return;
    const r = host.getBoundingClientRect();
    setTip({ lines, x: clientX - r.left, y: clientY - r.top });
  }, []);

  // Keyboard entry point: there is no pointer, so anchor to the element itself.
  const showAt = useCallback((lines: string[], host: HTMLElement | null, el: Element) => {
    if (!host || !lines.length) return;
    const r = host.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    setTip({ lines, x: b.left + b.width / 2 - r.left, y: b.top - r.top });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return { tip, show, showAt, hide };
}

export default function HoverTip({ tip }: { tip: TipState }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
      {tip.lines.map((line, i) => {
        const m = STATE_LINE.exec(line);
        if (!m) return <div className="viz-tip-line" key={i}>{line}</div>;
        return (
          <div className="viz-tip-line" key={i}>
            <span className="viz-tip-name">{m[1]}</span>
            <span className={`viz-tip-chip ${STATE_CLASS[m[2]] ?? ''}`}>{m[2]}</span>
          </div>
        );
      })}
    </div>
  );
}
