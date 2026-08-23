'use client';

// Physical Fitness Subitem Score — the HoloMotion report's 5-region ROM L/R,
// Stability L/R, Symmetry breakdown, rendered as tier-coloured score discs on
// the report's own 60/75/85 boundaries. Shared by the import preview
// (ScreeningPreview) and the athlete/medical/coach dashboard screening panel,
// so both surfaces present this section identically.

import type { Subitems } from './OverallRiskBadge';
import { TIER_COLOR, TIER_LABEL, TIER_ORDER, TIER_RANGE, tierMeta } from '@/lib/holomotionTiers';

const SUBITEM_REGIONS: Array<[keyof Subitems, string]> = [
  ['neck', 'Neck'], ['shoulder', 'Shoulder & Upper Limbs'], ['torso', 'Torso'],
  ['pelvis', 'Pelvis'], ['lowerLimbs', 'Lower Limbs'],
];
const SUBITEM_COLS: Array<[string, string]> = [
  ['romL', 'ROM L'], ['romR', 'ROM R'], ['stabL', 'Stab L'], ['stabR', 'Stab R'], ['sym', 'Sym'],
];

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// HoloMotion quality tier for the 0–100 subitem scores (higher is better).
// Shared with the score gauges above this table and the body map beside it —
// see lib/holomotionTiers.ts.
const tier = tierMeta;

export interface SubitemCohort {
  label: string;
  tier: string;
  n: number;
  matrix: Array<{ key: string; label: string; cells: Array<{ key: string; label: string; value: number | null; n: number }> }>;
}

// Peer context per cell, added 2026-08-23 at JC's instruction over a stated
// objection — and the objection is why this shows a group MEAN and nothing else.
//
// A cohort here is 5–10 athletes. A standard deviation per CELL from that many
// observations is unstable enough that banding a cell, or printing a z-score for
// it, would be inventing precision the data cannot support; the §33c argument
// about thin cohorts applies with more force at cell level, not less.
//
// So: "64, group 75.4" is a description a physiologist can weigh themselves.
// "64 — Below Average (z = −1.4)" would be a claim, and at five peers per cell
// it would be the wrong claim often enough to matter.
function cohortCell(
  cohort: SubitemCohort | null | undefined, regionKey: string, colKey: string,
): number | null {
  if (!cohort) return null;
  // The backend labels columns 'ROM L' / 'Stability L' / 'Symmetry'; this table
  // uses shorter heads. Match on position rather than on label text, which
  // would couple two independent wordings.
  const order = ['romL', 'romR', 'stabL', 'stabR', 'sym'];
  const idx = order.indexOf(colKey);
  const row = cohort.matrix.find((r) => r.key === regionKey || r.label === regionKey);
  const cell = row && idx >= 0 ? row.cells[idx] : null;
  return cell ? cell.value : null;
}

export default function SubitemTable({ subitems, cohort }: {
  subitems: Subitems | null | undefined;
  cohort?: SubitemCohort | null;
}) {
  if (!subitems || typeof subitems !== 'object') {
    return <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>No subitem scores were read from this report (older / compact layout).</div>;
  }
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="screening-subitem-table">
          <thead>
            <tr>
              <th />
              {SUBITEM_COLS.map(([, l]) => <th key={l}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {SUBITEM_REGIONS.map(([rkey, rlabel]) => {
              const row = subitems[rkey] || {};
              return (
                <tr key={rkey}>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{rlabel}</td>
                  {SUBITEM_COLS.map(([ckey]) => {
                    const v = num((row as Record<string, unknown>)[ckey]);
                    if (v === null) return <td key={ckey} className="text-muted">—</td>;
                    const t = tier(v);
                    const g = cohortCell(cohort, rkey as string, ckey);
                    return (
                      <td key={ckey}>
                        <span style={{
                          display: 'inline-block', minWidth: 26, padding: '2px 6px', borderRadius: 6,
                          fontSize: 'var(--fs-xs)', fontWeight: 700, color: '#fff', background: t.color,
                        }}>{v}</span>
                        {g !== null && (
                          <span
                            className="subitem-peer"
                            title={`Group average for this cell across ${cohort?.n} peers`}
                          >
                            {g}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {TIER_ORDER.map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: TIER_COLOR[t] }} />{TIER_LABEL[t]} {TIER_RANGE[t]}
          </span>
        ))}
      </div>
    </>
  );
}
