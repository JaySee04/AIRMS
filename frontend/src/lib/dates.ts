// Showing an instant as a DATE, in the institution's calendar.
//
// §45 fixed period BUCKETING to `INSTITUTION_TZ` and left display alone, so
// every date on screen rendered in whatever zone the VIEWER's browser is in.
// For a clinician in Malaysia that is the same zone and nothing looks wrong,
// which is exactly why it survived: the defect only appears for a reader
// elsewhere — an examiner, a supervisor abroad, anyone travelling — and it
// appears as a plausible date that is quietly a day out.
//
// It is not hypothetical. Measured against the live database: 45 of 537 stored
// timestamps fall on a different DAY in UTC than in Kuala Lumpur, because they
// are real clock events recorded in the Malaysian evening. `assessedAt` is not
// among them — all 74 sit at 19:10 MYT — so the screening date was always safe
// and the AUDIT and INJURY dates were not.
//
// The rule: anything that is a fact about WHEN THE INSTITUTION DID SOMETHING
// renders here. A relative age in days does not need this and does not use it.
//
// backend/src/utils/dates.js is the same decision for the other package.
import { INSTITUTION_TZ } from './shared/facts';

// Built once rather than per call: these run per row on tables that draw
// hundreds, and constructing an Intl formatter is not free.
const DAY_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: INSTITUTION_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

const DAY_HUMAN = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTION_TZ, day: 'numeric', month: 'short', year: 'numeric',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTION_TZ,
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Parse anything a payload might carry, or null when it is not a real instant. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-09-06` — sortable, for tables and anywhere alongside a machine value. */
export function isnDayIso(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? DAY_ISO.format(d) : fallback;
}

/** `6 Sep 2026` — for prose and captions, where an ISO string reads as a code. */
export function isnDay(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? DAY_HUMAN.format(d) : fallback;
}

/** `06/09/2026 15:42` — for the audit trail, where the time is the point. */
export function isnDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? DATE_TIME.format(d).replace(',', '') : fallback;
}

export { INSTITUTION_TZ };
