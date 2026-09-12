'use client';

// Side-by-side comparison — the fourth decision aid.
//
// The other three ORDER a list. This one answers a different question that a
// ranking cannot: "these two are both amber, which do I take first?" A rank
// hides the margin; a comparison shows it.
//
// It adds NO request. Everything here is already on the `/decisions` payload
// the worklist rendered, so opening a comparison costs nothing and cannot
// disagree with the list above it — the same reason the panel and the headline
// share one endpoint.
//
// THE CAVEAT IS THE FEATURE, and it is printed above the table rather than
// below it (§68's rule: underneath, it is read after the conclusion has already
// formed). Comparing two athletes on a screening score invites a selection
// decision the screening cannot support — these are movement-quality readings,
// not a ranking of who is fit to play — so the panel says so before it shows a
// single number.

import { useState } from 'react';
import { BAND_LABEL } from '@/lib/bands';
import type { WorklistEntry } from './DecisionPanel';

const MAX_COMPARE = 5;
/** Chips shown before the picker collapses — about one row at the pane's width. */
const PICKER_SHOWN = 10;

function label(band: string): string {
  if (band === 'never') return 'Never screened';
  if (band === 'none') return 'No band yet';
  return BAND_LABEL[band as keyof typeof BAND_LABEL] ?? band;
}

export default function CompareAthletes({ entries }: { entries: WorklistEntry[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const rows = entries.filter((e) => picked.includes(e.athleteId));

  // The 40 cap stays: it is the "a picker nobody can scan is not a picker"
  // limit, and it is separate from the collapse below.
  const pickable = entries.slice(0, 40);
  const visible = showAll
    ? pickable
    : pickable.filter((e, i) => i < PICKER_SHOWN || picked.includes(e.athleteId));
  const hidden = pickable.length - visible.length;

  function toggle(id: string) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE) return cur; // a table nobody can read is not a comparison
      return [...cur, id];
    });
  }

  if (!entries.length) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Compare athletes</h2>
        <span className="card-sub">
          Pick up to {MAX_COMPARE} to see them beside each other. A ranking hides the
          margin between two athletes in the same band; this shows it.
        </span>
      </div></div>

      {/* ABOVE the numbers, deliberately. */}
      <div className="alert alert-warning" style={{ marginBottom: 14 }}>
        <strong>This compares readings, not readiness.</strong>{' '}
        Two athletes in the same band are not interchangeable, and a better score here
        does not mean a lower chance of injury — the screening cannot support that. Use
        it to decide who to look at first, not who to select.
      </div>

      {/* COLLAPSED BY DEFAULT (2026-09-12). It rendered up to 40 chips, and on
          the seeded institution-wide worklist that is 24 — four rows of buttons,
          which was the busiest block on the clinician's landing pane and made
          the table underneath it easy to miss.
          `PICKER_SHOWN` is one row at the medical pane's width. The control is
          worded and shaped like the worklist's own "Show all 24" directly above,
          so the page has one idiom for "there is more of this" rather than two.
          Entries are already worst-first, so the ones behind the fold are the
          least urgent — the cut is not arbitrary.
          Anything PICKED stays visible whatever the cap: a chip that vanished
          while still counting toward the five would be unexplainable. */}
      <div className="compare-picker">
        {visible.map((e) => (
          <button
            key={e.athleteId}
            type="button"
            className={`btn btn-outline btn-sm${picked.includes(e.athleteId) ? ' is-picked' : ''}`}
            aria-pressed={picked.includes(e.athleteId)}
            onClick={() => toggle(e.athleteId)}
            disabled={!picked.includes(e.athleteId) && picked.length >= MAX_COMPARE}
          >
            {e.name ?? e.athleteId}
          </button>
        ))}
        {(hidden > 0 || showAll) && pickable.length > PICKER_SHOWN && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show fewer' : `Show all ${pickable.length}`}
          </button>
        )}
      </div>

      {rows.length >= 2 && (
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="cohort-profile-table">
            <thead>
              <tr>
                <th scope="col">Athlete</th>
                <th scope="col">Band</th>
                <th scope="col" className="num">Screening age</th>
                <th scope="col">Recall</th>
                <th scope="col">Why they are flagged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.athleteId}>
                  <td><strong>{r.name ?? r.athleteId}</strong>{r.isInjured && <> · <span style={{ color: 'var(--risk-moderate)' }}>injured</span></>}</td>
                  <td><span className={`decision-band decision-band--${r.band}`}>{label(r.band)}</span></td>
                  {/* An athlete with no screening has no age — a dash, never a 0,
                      because 0 would read as "screened today". */}
                  <td className="num">{r.ageDays === null ? '—' : `${r.ageDays}d`}</td>
                  <td>{r.recall ?? '—'}</td>
                  <td style={{ fontSize: 'var(--fs-sm)' }}>{r.reasons.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 1 && (
        <p className="card-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Pick one more — a comparison needs two.
        </p>
      )}
    </div>
  );
}
