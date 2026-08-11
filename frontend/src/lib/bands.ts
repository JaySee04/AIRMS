// The risk-band vocabulary for the frontend — one definition of what each band
// is CALLED and what colour it is drawn in.
//
// The backend has had `utils/bands.js` since 2026-08-10 for exactly this reason.
// The frontend never got the equivalent, and it had already drifted: six files
// declared their own map, and the same red band was labelled "Immediate
// assessment" in the risk hero and "Immediate" in the trend legend and the admin
// distribution bar — two names for one clinical state, on screens an admin sees
// side by side.
//
// Both spellings were defensible in place: a legend under a chart has no room for
// "Immediate assessment". So this exports BOTH, deliberately, rather than forcing
// one string and making some panel worse:
//   BAND_LABEL — the full clinical wording. Use in prose, heroes, reports.
//   BAND_SHORT — the compact form. Use in legends, chips, table cells.
// What is no longer possible is a SEVENTH spelling appearing by accident.
//
// Colours stay CSS custom properties so they follow the theme, and they are the
// status tokens — never reuse them as chart series hues (see --series-* in
// globals.css for why).

export type Band = 'green' | 'amber' | 'red';

export const BANDS: Band[] = ['green', 'amber', 'red'];

/** Full clinical wording — matches the backend's BAND_LABEL exactly. */
export const BAND_LABEL: Record<Band, string> = {
  green: 'Safe',
  amber: 'Needs attention',
  red: 'Immediate assessment',
};

/** Compact wording for legends, chips and narrow table cells. */
export const BAND_SHORT: Record<Band, string> = {
  green: 'Safe',
  amber: 'Needs attention',
  red: 'Immediate',
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

/** Ordering for "worse than" comparisons. Higher = worse. Mirrors BAND_RANK. */
export const BAND_RANK: Record<Band, number> = { green: 0, amber: 1, red: 2 };

export const isBand = (v: unknown): v is Band => v === 'green' || v === 'amber' || v === 'red';

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
