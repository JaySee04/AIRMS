'use client';

// Physical Fitness Subitem Score — the HoloMotion report's 5-region ROM L/R,
// Stability L/R, Symmetry breakdown, rendered as tier-coloured score discs on
// the report's own 60/75/85 boundaries. Shared by the import preview
// (ScreeningPreview) and the athlete/medical/coach dashboard screening panel,
// so both surfaces present this section identically.

import type { Subitems } from './OverallRiskBadge';

const SUBITEM_REGIONS: Array<[keyof Subitems, string]> = [
  ['neck', 'Neck'], ['shoulder', 'Shoulder & Upper Limbs'], ['torso', 'Torso'],
  ['pelvis', 'Pelvis'], ['lowerLimbs', 'Lower Limbs'],
];
const SUBITEM_COLS: Array<[string, string]> = [
  ['romL', 'ROM L'], ['romR', 'ROM R'], ['stabL', 'Stab L'], ['stabR', 'Stab R'], ['sym', 'Sym'],
];

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// HoloMotion quality tier for the 0–100 subitem scores (higher is better).
function tier(v: number) {
  if (v >= 85) return { label: 'Excellent', color: 'var(--risk-low)' };
  if (v >= 75) return { label: 'Good', color: 'var(--risk-undertrained, #2a9db8)' };
  if (v >= 60) return { label: 'Average', color: 'var(--risk-mod)' };
  return { label: 'Below', color: 'var(--risk-high)' };
}

export default function SubitemTable({ subitems }: { subitems: Subitems | null | undefined }) {
  if (!subitems || typeof subitems !== 'object') {
    return <div className="text-muted" style={{ fontSize: '0.8rem' }}>No subitem scores were read from this report (older / compact layout).</div>;
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
                    return (
                      <td key={ckey}>
                        <span style={{
                          display: 'inline-block', minWidth: 26, padding: '2px 6px', borderRadius: 6,
                          fontSize: '0.74rem', fontWeight: 700, color: '#fff', background: t.color,
                        }}>{v}</span>
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
        {[['Excellent ≥85', 'var(--risk-low)'], ['Good ≥75', 'var(--risk-undertrained, #2a9db8)'], ['Average ≥60', 'var(--risk-mod)'], ['Below <60', 'var(--risk-high)']].map(([l, c]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}
          </span>
        ))}
      </div>
    </>
  );
}
