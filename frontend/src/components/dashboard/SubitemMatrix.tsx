'use client';

// THE PHYSICAL FITNESS SUBITEM SCORE, as HoloMotion prints it (2026-10-09, JC,
// DESIGN_DECISIONS §151).
//
// JC, with a photograph of the HoloMotion app beside the dashboard: "make sure
// that you include the information from the HoloMotion PDF as shown from the
// picture of a phone screen within the athlete dashboard that is accessed by
// the medical staff."
//
// Of the three blocks on that screen, AIRMS already drew two — the score gauges
// and the eight Exercise Risk indicators are both in ScreeningPanel. The 25-cell
// subitem table was the one that was not, and it is the densest thing the
// instrument produces: TOTAL SCORE IS LITERALLY ITS MEAN. The system stored it,
// aggregated it at squad level (utils/subitemAggregate.js), drew it on the
// admin heatmap and printed it in the PDF — and never showed an individual
// athlete's own 25 numbers on any dashboard.
//
// WHY IT WAS LEFT OUT, AND WHY THAT REASONING NO LONGER HOLDS. ScreeningPanel's
// header says the subitem scores are "NOT rendered here — the BodyMap card that
// sits beside this one draws them". That is true of the ROM/Stability values:
// the body map paints them onto the figure. But the figure paints the WORSE of
// left and right (§4a), so the L/R SPLIT — which is the entire point of a table
// with separate L and R columns, and the thing a clinician reads asymmetry off
// — is discarded before it reaches the screen. A reader could see that the neck
// was amber and not that it was 96 on the right and 61 on the left.
//
// SO THIS IS NOT A SECOND VIEW OF THE SAME DATA. The map answers "where", this
// answers "which side, by how much" — the same split §23 made at squad level,
// where left-right asymmetry turned out to be the only bilateral signal the
// report carries and three different surfaces were collapsing it.
//
// READ IN ONE DIRECTION ONLY: these are HoloMotion's own 0-100 quality scores,
// higher is better, tier-coloured on the SAME scale as every gauge (§135's
// "tier" system, never the band one). A cell with no reading is DASHED, never
// drawn as a zero — §54, and on a printed grid a fabricated 0 reads as
// "measured, and terrible".
import { TIER_COLOR, TIER_INK, TIER_LABEL, tierOf } from '@/lib/holomotionTiers';
import type { Subitems, SubitemRow } from './OverallRiskBadge';

// HoloMotion's own row order and its own printed names, so the screen can be
// laid beside the PDF and read line for line (§21 rests on exactly that).
const ROWS: { key: keyof Subitems; label: string }[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulder', label: 'Shoulder and Upper Limbs' },
  { key: 'torso', label: 'Torso' },
  { key: 'pelvis', label: 'Pelvis' },
  { key: 'lowerLimbs', label: 'Lower Limbs' },
];

const COLS: { key: keyof SubitemRow; label: string; group: string }[] = [
  { key: 'romL', label: 'L', group: 'ROM' },
  { key: 'romR', label: 'R', group: 'ROM' },
  { key: 'stabL', label: 'L', group: 'Stability' },
  { key: 'stabR', label: 'R', group: 'Stability' },
  { key: 'sym', label: '', group: 'Symmetry' },
];

// A gap worth a clinician's attention. The same 10-point threshold the squad
// panel counts on (§23) — one definition of "notable", so an athlete flagged
// here is an athlete counted there.
const NOTABLE_GAP = 10;

function Cell({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    // §54: an unknown value stays unknown. Dashed, not zero, not tier-coloured.
    return <td className="sm-cell sm-cell--none" aria-label="no reading">—</td>;
  }
  const tier = tierOf(v);
  return (
    <td
      className="sm-cell"
      style={{ background: TIER_COLOR[tier], color: TIER_INK[tier] }}
      // The tier is named, never carried by colour alone (SILENT_FAILURES 3i).
      title={`${v} — ${TIER_LABEL[tier]}`}
    >
      {v}
    </td>
  );
}

export default function SubitemMatrix({ subitems }: { subitems?: Subitems | null }) {
  const present = ROWS.filter((r) => subitems?.[r.key]);
  if (!present.length) return null;

  // Asymmetry is computed here rather than read, because the report does not
  // print it — the subtraction was left to the reader on paper, and leaving it
  // to them on screen too would be reproducing a limitation rather than the
  // data (§23).
  const gaps = present.flatMap((r) => {
    const row = subitems![r.key]!;
    return [
      { region: r.label, what: 'ROM', l: row.romL, r: row.romR },
      { region: r.label, what: 'Stability', l: row.stabL, r: row.stabR },
    ];
  }).filter((g) => (
    typeof g.l === 'number' && typeof g.r === 'number'
      && Math.abs(g.l - g.r) >= NOTABLE_GAP
  )).map((g) => ({
    ...g,
    gap: Math.abs((g.l as number) - (g.r as number)),
    weaker: (g.l as number) < (g.r as number) ? 'left' : 'right',
  })).sort((a, b) => b.gap - a.gap);

  return (
    <div className="subitem-matrix">
      <div className="table-wrap">
        <table className="sm-table">
          <caption className="sr-only">
            Physical Fitness Subitem Score — HoloMotion&apos;s 0 to 100 quality scores by region
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="sm-rowhead">Region</th>
              <th scope="col" colSpan={2}>ROM</th>
              <th scope="col" colSpan={2}>Stability</th>
              <th scope="col" rowSpan={2}>Symmetry</th>
            </tr>
            <tr>
              {COLS.filter((c) => c.label).map((c) => (
                <th scope="col" key={`${c.group}-${c.label}`} className="sm-side">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {present.map((r) => {
              const row = subitems![r.key]!;
              return (
                <tr key={String(r.key)}>
                  <th scope="row" className="sm-rowhead">{r.label}</th>
                  {COLS.map((c) => <Cell key={c.key} v={row[c.key]} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {gaps.length > 0 && (
        <p className="sm-gaps">
          <strong>Left–right gap of {NOTABLE_GAP} or more:</strong>{' '}
          {gaps.map((g) => `${g.region} ${g.what.toLowerCase()} (${g.gap} pts, ${g.weaker} weaker)`).join('; ')}
        </p>
      )}
    </div>
  );
}
