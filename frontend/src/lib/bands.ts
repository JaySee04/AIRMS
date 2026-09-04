// The risk-band vocabulary for the frontend — one definition of what each band
// is CALLED and what colour it is drawn in.
//
// The backend has had utils/bands.js since 2026-08-10; the frontend never got
// the equivalent and had already drifted. Six files declared their own map, and
// the red band read "Immediate assessment" in the risk hero but "Immediate" in
// the trend legend and admin distribution bar — two names for one clinical state,
// on screens an admin sees side by side.
//
// Both spellings are defensible in place (a legend has no room for the long
// form), so BOTH are exported rather than forcing one and making a panel worse:
//   BAND_LABEL — full clinical wording, for prose, heroes and reports.
//   BAND_SHORT — compact, for legends, chips and table cells.
// What is no longer possible is a seventh spelling appearing by accident.
//
// Colours stay CSS custom properties so they follow the theme, and they are the
// status tokens — never reuse them as chart series hues (see --series-* in
// globals.css for why).

// The vocabulary itself, its ORDER, its ranking and the clinical wording come
// from shared/facts.js at the repository root, generated into both packages.
// "Matches the backend exactly" is no longer a claim a test has to check after
// the fact — it is the same source.
//
// GREEN IS NOT "SAFE" — see the note there and docs/DESIGN_DECISIONS.md §33.
// The label describes the finding, not the athlete.
export type { Band } from './shared/facts';
export { BANDS, BAND_LABEL, BAND_RANK } from './shared/facts';

import type { Band } from './shared/facts';
import { BANDS, BAND_LABEL } from './shared/facts';

/** Compact wording for legends, chips and narrow table cells. */
export const BAND_SHORT: Record<Band, string> = {
  green: 'None flagged',
  amber: 'Needs attention',
  red: 'Immediate',
};

/**
 * A SHAPE per band, so the band survives without colour.
 *
 * Red/amber/green is the textbook failure of colour-only status: the three hues
 * collapse into one another for the ~1 in 12 men with a red-green deficiency,
 * and screen readers announce no colour at all. WCAG 1.4.1 is explicit that
 * colour may not be the only carrier of meaning. The coach's squad table was
 * exactly that — a coloured dot beside the indicator number, with the band word
 * only in a `title` tooltip, which neither assistive technology nor a touch
 * device ever surfaces.
 *
 * Shape rather than a word because the fix has to fit a narrow table cell that
 * already carries a number; pair it with `BAND_SHORT` wherever there is room,
 * and always give the element an accessible name from `BAND_LABEL`.
 *
 * Web only. These are NOT WinAnsi characters, so they must never reach pdfkit —
 * see DESIGN_DECISIONS §30f, where an out-of-set glyph measures zero width and
 * prints as mojibake. The PDFs already print the band as a word.
 */
export const BAND_GLYPH: Record<Band, string> = {
  green: '●', // ● filled circle
  amber: '▲', // ▲ triangle
  red: '■',   // ■ square
};

export const BAND_COLOR: Record<Band, string> = {
  green: 'var(--risk-low)',
  amber: 'var(--risk-moderate)',
  red: 'var(--risk-high)',
};

/** Tinted background, for the band-washed hero panels. */
export const BAND_BG: Record<Band, string> = {
  green: 'var(--risk-low-bg)',
  amber: 'var(--risk-moderate-bg)',
  red: 'var(--risk-high-bg)',
};

/** The badge class used by chips and table cells. */
export const BAND_BADGE: Record<Band, string> = {
  green: 'badge-low',
  amber: 'badge-moderate',
  red: 'badge-high',
};

export const isBand = (v: unknown): v is Band => BANDS.includes(v as Band);

/** Colour for a possibly-absent band, falling back to muted rather than a status hue. */
export const bandColor = (b: unknown): string => (isBand(b) ? BAND_COLOR[b] : 'var(--text-muted)');

/**
 * The three bands as chart/legend segments, in fixed order.
 * `counts` is keyed by band; missing keys read as 0.
 */
export function bandSegments(
  counts: Partial<Record<Band, number>>,
  { short = false }: { short?: boolean } = {},
): Array<{ label: string; value: number; color: string }> {
  return BANDS.map((b) => ({
    label: short ? BAND_SHORT[b] : BAND_LABEL[b],
    value: counts[b] ?? 0,
    color: BAND_COLOR[b],
  }));
}
