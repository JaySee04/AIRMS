// Period-grain vocabulary and the screening-date format, shared.
//
// Both were declared twice, verbatim: GRAINS in TrendStrip and the Programme
// Activity page, and the date formatter in the athlete history page and the
// medical/coach screening date picker. Neither had drifted yet — but they are the
// labels on the same control and the same timestamp on the same screening, so a
// divergence would show up as the app disagreeing with itself about what a
// quarter is called or how a date is written.

// The grain keys and their order come from shared/facts.js (generated into both
// packages); the LABELS are this package's own, because the backend has no
// button to put them on.
import { GRAINS as GRAIN_KEYS, INSTITUTION_TZ } from './shared/facts';
import type { Grain } from './shared/facts';

export type { Grain };
export { INSTITUTION_TZ };

const GRAIN_LABEL: Record<Grain, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };

export const GRAINS: Array<{ key: Grain; label: string }> = GRAIN_KEYS
  .map((key) => ({ key, label: GRAIN_LABEL[key] }));

/** Grain as a noun, for prose ("only one quarter of screening falls here"). */
export const GRAIN_NOUN: Record<Grain, string> = { month: 'month', quarter: 'quarter', year: 'year' };

/**
 * The calendar this system dates things in: ISN's, not the viewer's.
 *
 * This formatter passed `undefined` as the locale AND left the timezone
 * unset, so it rendered in whatever zone the browser happened to be in, while
 * the backend bucketed the same row into a month with `getUTC*()`. On the
 * hosted instance the API runs in UTC and a clinician's browser runs in MYT
 * (UTC+8), so a screening taken between 00:00 and 07:59 local sits on the
 * PREVIOUS UTC day — and across a month end the trend chart drew it in one
 * column while the row beneath it carried a date in the next month.
 *
 * Pinned rather than left to the viewer because a screening belongs to the day
 * it happened at ISN. A coach opening the same dashboard while abroad should
 * read the same date their colleague in Bukit Jalil does.
 *
 * Read from shared/facts.js, generated into both packages, so it EQUALS the
 * zone backend/src/utils/screeningPeriods.js buckets in rather than merely
 * being checked against it afterwards. Re-exported at the top of this file.
 */

/** A screening's assessed-at, to the minute — two screenings can share a day. */
export const fmtScreeningDate = (d: string | null | undefined): string => (d
  ? new Date(d).toLocaleString('en-GB', {
    timeZone: INSTITUTION_TZ,
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : 'Undated');
