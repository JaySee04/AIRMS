// Renders the segments produced by lib/athleteSearch, bolding the runs the
// query matched.
//
// Shared rather than defined beside each search box: the medical rail and the
// upload page's athlete picker both draw hits from the same matcher, and a
// highlight that means "matched" in one place and something subtly different in
// the other is the kind of drift this codebase keeps paying for.
//
// Why highlight at all — it is the only thing that shows a clinician WHY a row
// came back. On a roster where an IC fragment can match incidental digits in the
// middle of someone else's number, "matched on the IC I typed" and "matched on
// something else" have to be tellable apart at a glance.

import type { Segment } from '@/lib/athleteSearch';

export default function MarkedText({
  segments,
  fallback,
}: {
  segments: Segment[];
  /** Shown when there are no segments — an empty query highlights nothing. */
  fallback: string;
}) {
  if (!segments.length) return <>{fallback}</>;
  return (
    <>
      {segments.map((s, i) => (
        s.hit
          // Index keys are safe here: the list is a positional decomposition of
          // one string, rebuilt whole on every query change.
          // eslint-disable-next-line react/no-array-index-key
          ? <mark key={i} className="search-hit">{s.text}</mark>
          // eslint-disable-next-line react/no-array-index-key
          : <span key={i}>{s.text}</span>
      ))}
    </>
  );
}
