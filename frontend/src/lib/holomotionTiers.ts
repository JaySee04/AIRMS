// The HoloMotion quality tier — the instrument's own 60 / 75 / 85 boundaries
// for every 0-100 "higher is better" score (headline gauges, the 25 subitem
// scores, the body map's ROM & Stability mode).
//
// WHY THIS EXISTS
// This tier was defined independently in four places — ScreeningPanel's
// qualityBand(), SubitemTable's tier(), BodyMap's worstTier() + TIER_LABEL, and
// the PDF's TIERS in backend/src/utils/pdfDraw.js. The boundaries agreed, but
// the wording had already drifted: the lowest tier read "Below Average" in the
// panel and on the PDF, and "Below" in the subitem table and the body-map
// legend — and ScreeningPanel *renders SubitemTable inside itself*, so both
// words appeared on screen at once, describing the same number.
//
// Colours are CSS custom properties, not literals, so a tier follows the theme.
// The four risk tokens carry the tier meaning across the whole app:
//   --risk-low          green   Excellent
//   --risk-undertrained blue    Good
//   --risk-moderate     amber   Average
//   --risk-high         red     Below Average
// (BodyMap fills its shapes through the .excellent/.good/.average/.below
// classes in globals.css, which resolve to these same four tokens.)
//
// The backend PDF cannot read CSS variables, so pdfDraw.js keeps its own TIERS
// table with the light-theme values of these tokens written out. That copy is
// deliberate and is marked as a mirror of this file — if a boundary, a label or
// a colour changes here, change it there too.

export type TierState = 'excellent' | 'good' | 'average' | 'below';

export const TIER_MIN: Record<TierState, number> = {
  excellent: 85,
  good: 75,
  average: 60,
  below: 0,
};

/** Ordering for "which of these is worst" comparisons. */
export const TIER_RANK: Record<TierState, number> = { below: 0, average: 1, good: 2, excellent: 3 };

export const TIER_LABEL: Record<TierState, string> = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  below: 'Below Average',
};

export const TIER_COLOR: Record<TierState, string> = {
  excellent: 'var(--risk-low)',
  good: 'var(--risk-undertrained)',
  average: 'var(--risk-moderate)',
  below: 'var(--risk-high)',
};

/** The range shown in legends, e.g. "≥85" / "<60". */
export const TIER_RANGE: Record<TierState, string> = {
  excellent: '≥85',
  good: '≥75',
  average: '≥60',
  below: '<60',
};

/** Worst → best, the order legends read in. */
export const TIER_ORDER: TierState[] = ['excellent', 'good', 'average', 'below'];

export function tierOf(v: number): TierState {
  if (v >= TIER_MIN.excellent) return 'excellent';
  if (v >= TIER_MIN.good) return 'good';
  if (v >= TIER_MIN.average) return 'average';
  return 'below';
}

/** Label + colour in one call — what the display components actually want. */
export function tierMeta(v: number): { state: TierState; label: string; color: string } {
  const state = tierOf(v);
  return { state, label: TIER_LABEL[state], color: TIER_COLOR[state] };
}
