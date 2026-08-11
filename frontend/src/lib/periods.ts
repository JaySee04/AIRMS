// Period-grain vocabulary and the screening-date format, shared.
//
// Both were declared twice, verbatim: GRAINS in TrendStrip and the Programme
// Activity page, and the date formatter in the athlete history page and the
// medical/coach screening date picker. Neither had drifted yet — but they are the
// labels on the same control and the same timestamp on the same screening, so a
// divergence would show up as the app disagreeing with itself about what a
// quarter is called or how a date is written.

export type Grain = 'month' | 'quarter' | 'year';

export const GRAINS: Array<{ key: Grain; label: string }> = [
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

/** Grain as a noun, for prose ("only one quarter of screening falls here"). */
export const GRAIN_NOUN: Record<Grain, string> = { month: 'month', quarter: 'quarter', year: 'year' };

/** A screening's assessed-at, to the minute — two screenings can share a day. */
export const fmtScreeningDate = (d: string | null | undefined): string => (d
  ? new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : 'Undated');
