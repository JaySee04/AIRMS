'use client';

// THE INFO AFFORDANCE. One definition, used everywhere a card explains itself.
//
// Supersedes MethodNote (§127), which was a block disclosure that pushed the
// card's own content further down the page — it hid the words and kept the
// vertical space, so a reader still scrolled past a row of grey pills. This sits
// INLINE on the card header and costs 18px beside the title.
//
// ─── WHAT GOES IN HERE, AND WHAT MUST NOT ──────────────────────────────────
//
// JC asked for "any description" to move behind the toggle (2026-10-06). Taken
// literally that is the one change this project cannot ship: §33 exists because
// green must never read "Safe", and a §33 caveat behind a toggle IS green
// reading "Safe" until somebody clicks. The reader most likely to misread is the
// reader least likely to press a button.
//
// So page prose splits THREE ways, not two (§131.2). The first two stay on the
// card; only the third moves in here:
//
//   LABEL    names the units, the sort, the legend. One clause.
//            "0-100, higher is better" · "worst first" · "L = left, R = right"
//            TEST: without it the card is unlabelled. A tooltip cannot label.
//
//   CAVEAT   changes how the number is READ.
//            "a mean is not an athlete" · "never screened is counted apart"
//            "the lines are medians, not fixed cut-offs"
//            TEST: would a reader draw a WRONG conclusion without this sentence?
//
//   METHOD   how it is built, why it is built that way, what it refuses to say.
//            TEST: does a reader who already knows the instrument lose anything?
//            If no, it belongs in here.
//
// The three-way split is what lets this be applied to all 26 pages rather than
// the two it started on: nearly all the LENGTH was method, and nearly all the
// SAFETY was in one-clause caveats that were drowning in it. Hiding the method
// makes the caveats visible for the first time.
//
// ─── WHY IT IS NOT HOVER-ONLY ──────────────────────────────────────────────
//
// It opens on hover, which is what was asked for, and ALSO on focus and on
// click, which is what makes it work at all. A hover-only disclosure is
// unreachable on every touch screen and from the keyboard — on a tablet at the
// side of a court, the explanation would simply not exist.
//
// WCAG 1.4.13 (Content on Hover or Focus) names three obligations that a
// hand-rolled tip has to earn, and each is a line of code here:
//   DISMISSIBLE  Escape closes it without moving the pointer.
//   HOVERABLE    the panel is a DOM CHILD of the hover target, so moving the
//                pointer onto it never fires pointerleave. A detached panel
//                plus a grace timer is the usual answer and it is the one that
//                breaks: the timer is a race, and the race is lost on a slow
//                render. The ::before bridge covers the visual gap.
//   PERSISTENT   it closes on leave, blur, Escape or an outside click, and
//                never on a timer.
//
// Touch: pointerenter fires for a tap too, and would open the panel a frame
// before the click closed it again. Mouse pointers only; touch goes through
// the click path, which pins.

import { useCallback, useEffect, useId, useRef, useState } from 'react';

export default function InfoTip({
  children,
  label = 'How this is calculated',
  align = 'auto',
}: {
  children: React.ReactNode;
  /**
   * The accessible name, and the heading inside the panel. Say what is in
   * there — "Info" alone makes the reader press it to find out whether they
   * needed to.
   */
  label?: string;
  /** Panel edge to pin to. 'auto' flips near the right of the viewport. */
  align?: 'auto' | 'left' | 'right';
}) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  // DISMISSED-BUT-STILL-HOVERED. Escape has to win over a hover or a focus that
  // is still live, and `escaped` is the only way to express that: clearing the
  // three inputs cannot work, because the pointer is still on the button and the
  // focus is still in the wrapper, so the next render puts them straight back.
  //
  // This is a real defect that the browser checks could not see. They pressed
  // Escape from the KEYBOARD path, where the button already holds focus, so the
  // handler's `btn.focus()` was a no-op and the panel stayed shut. From the HOVER
  // path the same line moved focus TO the button, fired onFocus, and reopened the
  // panel Escape had just closed — "dismissible" satisfied in exactly the case
  // nobody tests and broken in the one a mouse user meets. Found by the jsdom
  // test, where a click does not focus and the bug therefore shows up first try.
  const [escaped, setEscaped] = useState(false);
  const [flip, setFlip] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  const open = !escaped && (pinned || hover || focus);

  // A fresh gesture clears the dismissal — leaving and coming back, or asking
  // for it outright. WCAG 1.4.13 asks that it be dismissible without moving the
  // pointer, not that it stay dismissed for ever.
  const revive = useCallback(() => setEscaped(false), []);
  const close = useCallback(() => { setPinned(false); setHover(false); setFocus(false); }, []);

  // Which edge to hang the panel from, decided when it opens rather than in CSS:
  // the panel is 300px wide and most of these sit in a card header on the right
  // of a wide page, where a left-aligned panel runs off the viewport.
  useEffect(() => {
    if (!open || align !== 'auto') return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setFlip(r.left > window.innerWidth / 2);
  }, [open, align]);

  // Dismissible without moving the pointer, and an outside click closes a pinned
  // panel. Bound only while open, so a page of forty tips has no idle listeners.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setEscaped(true);
      setPinned(false);
      // Focus returns to the button ONLY if it was already inside the tip.
      // Pulling it here from a hover would move a keyboard user's place on the
      // page because a mouse user pressed a key.
      if (wrap.current?.contains(document.activeElement)) btn.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  return (
    <span
      className={`infotip${open ? ' is-open' : ''}`}
      ref={wrap}
      // Mouse only. A tap fires pointerenter too, and the click that follows
      // would toggle a panel the tap had just opened.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { revive(); setHover(true); } }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') { setHover(false); revive(); } }}
      // focusin/focusout, so focus moving INTO the panel keeps it open and the
      // panel's own links stay reachable.
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) { setFocus(false); revive(); }
      }}
    >
      <button
        type="button"
        ref={btn}
        className="infotip-btn"
        aria-expanded={open}
        aria-controls={id}
        // The glyph is decoration, so the button needs a real name. Without this
        // a screen reader announces "i, button" forty times down the page.
        aria-label={label}
        onClick={() => {
          // Pinning is what makes this work on a touch screen and what lets a
          // reader move the pointer away mid-sentence. Un-pinning also drops the
          // hover, or the panel would stay open under the cursor and the click
          // would look dead.
          if (pinned) { close(); return; }
          revive();
          setPinned(true);
        }}
      >
        <span aria-hidden>i</span>
      </button>
      {open && (
        <span className={`infotip-panel${flip ? ' infotip-panel--right' : ''}`} id={id} role="note">
          <span className="infotip-panel-title">{label}</span>
          {children}
        </span>
      )}
    </span>
  );
}
