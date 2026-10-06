'use client';

// Method text, behind a toggle. CAVEATS DO NOT GO IN HERE.
//
// JC asked for the dashboard explanations to be hidden behind an INFO toggle
// (2026-10-06). The pages had genuinely become wordy — §126's scatter block alone
// is four paragraphs — so the complaint is fair. What this component does NOT do
// is hide all of it, and the distinction is the whole design (§127.3).
//
//   STAYS VISIBLE   a caveat that changes how a number is READ.
//                   "not a fitness-to-play decision", "a mean is not the squad",
//                   "never screened is counted apart", "the lines are medians".
//
//   GOES IN HERE    method and teaching. How the chart is built, what the axes
//                   are, why two scores can disagree, what a median does when
//                   the filter changes.
//
// THE TEST: would a reader draw a WRONG CONCLUSION without this sentence? If yes
// it is a caveat and it stays on the card. If a reader who already knows the
// method loses nothing, it belongs here.
//
// WHY NOT ALL OF IT. Hiding a caveat makes the DEFAULT state of the page the
// un-caveated reading, and the reader most likely to misread is the one least
// likely to press a button. That is this project's defect class — a confident
// wrong answer that looks right — with an affordance added. §33 exists because
// green must never read "Safe"; a §33 caveat behind a toggle is green reading
// "Safe" until somebody clicks.
//
// Collapsed by default, which is the point, and NOT persisted: a reader who opened
// the method once has learned it, and a sticky open state would quietly restore
// the wordiness this exists to remove. Cheap to reopen.
import { useId, useState } from 'react';

export default function MethodNote({
  children,
  label = 'How this is calculated',
}: {
  children: React.ReactNode;
  /** Say what is inside. "Info" alone makes the reader press it to find out. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="method-note">
      <button
        type="button"
        className="method-note-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {/* The glyph is decoration; the LABEL is the accessible name, so a screen
            reader hears "How this is calculated, collapsed" rather than "i". */}
        <span className="method-note-icon" aria-hidden>i</span>
        {label}
        <span className="method-note-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {/* Unmounted rather than hidden when closed: a visually-hidden block is
          still a tab stop and still announced, which would leave the page just as
          noisy for anyone not using a mouse. */}
      {open && <div className="method-note-body" id={id}>{children}</div>}
    </div>
  );
}
