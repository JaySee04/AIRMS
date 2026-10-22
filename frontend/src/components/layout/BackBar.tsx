'use client';

import Link from 'next/link';

// THE WAY OUT OF A DRILL-DOWN, IN ONE PLACE (2026-10-13, JC, §163).
//
// JC: "I am unhappy with the navigation ... make sure there are easily
// accessible navigation features like the dashboard back button for the
// medical staff."
//
// Two pages open an athlete inside themselves — the medical record and the
// coach's squad member — and each carried its own back control in its own
// place: the medical one in the identity card's FOOTER (265px down, and absent
// entirely while the record was loading or had failed to load, with the rail
// folded away — measured, a bad `?athlete=` left no visible way out at all);
// the coach's at the top, but gone the moment the reader scrolled into a record
// that runs several screens long.
//
// So: one bar, at the top of the drill-down, STICKY beneath the topbar, and
// rendered from the moment a selection exists rather than once the record has
// loaded. `secondary` is the way back to wherever the reader came FROM when that
// was another page (Sport Assessment's shortlist), because "Back to worklist"
// from there lands somewhere they never were.
//
// `current` names what is open. It is the answer to "where am I" once the
// identity card has scrolled away, which is the moment the bar matters.
export default function BackBar({
  label, onBack, current, secondary,
}: {
  label: string;
  onBack: () => void;
  current?: string | null;
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <nav className="back-bar" aria-label="Back">
      <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
        &larr; {label}
      </button>
      {secondary && (
        <Link href={secondary.href} className="btn btn-outline btn-sm">
          &larr; {secondary.label}
        </Link>
      )}
      {current && <span className="back-bar-current" aria-current="page">{current}</span>}
    </nav>
  );
}
