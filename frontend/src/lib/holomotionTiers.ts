// The HoloMotion quality tier — the instrument's own 60 / 75 / 85 boundaries
// for every 0–100 "higher is better" score: the headline gauges, the 25 subitem
// scores, and the body map's ROM & Stability mode.
//
// Sole definition of the boundaries, wording and colours. It was previously
// duplicated across five components and the wording had drifted (see
// DESIGN_DECISIONS §19). Colours are CSS custom properties so a tier follows
// the theme; BodyMap paints via the .excellent/.good/.average/.below classes,
// which resolve to the same four tokens.
//
// pdfDraw.js keeps a written-out copy of the light-theme values — a Node
// process can't read CSS variables. Change a boundary, label or colour here and
// change it there too.

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

/**
 * The ink for text printed ON a tier fill (2026-09-29, §122).
 *
 * Parallel to TIER_COLOR and kept beside it, because the pair only works if
 * both move together — a fill changed without its ink is a cell that still
 * shows a number and no longer lets you read it.
 *
 * Every consumer used a flat white. Measured on the subitem heatmap, that is
 * 2.56:1 on the amber tier and 2.36:1 on the blue, against a 4.5 requirement.
 * Each token resolves per theme; the dark theme's fills are lighter, so all
 * four take a dark ink there while only two do in light.
 */
export const TIER_INK: Record<TierState, string> = {
  excellent: 'var(--on-risk-low)',
  good: 'var(--on-risk-undertrained)',
  average: 'var(--on-risk-moderate)',
  below: 'var(--on-risk-high)',
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
