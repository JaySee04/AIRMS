// Turning an instant into a DATE, once, in the institution's calendar.
//
// §45 established that a screening belongs to ISN's calendar and fixed period
// BUCKETING to `INSTITUTION_TZ`. It did not fix DISPLAY, and those are separate
// code paths — so the system ended up with two timezone rules for one instant:
//
//   screeningPeriods.js  buckets in Asia/Kuala_Lumpur   (correct since §45)
//   pdfDraw.js fmtDate   `toISOString().slice(0, 10)`   = UTC, unconditionally
//
// On the hosted instance the API process runs UTC, so a screening assessed
// between 00:00 and 07:59 Malaysian time prints as the PREVIOUS DAY on the
// individual report — the document a clinician files and checks against the
// HoloMotion PDF in their hand — while the period chart correctly places it in
// the right month. That is the same 00:00-07:59 window §45 identified, left open
// on the display half.
//
// It also named the downloaded FILE, so two reports for the same athlete could
// carry dates a day apart depending on which surface produced the name.
//
// Measured before changing anything: 0 of 74 seeded screenings are affected,
// because the seeder writes every assessedAt at 11:10 UTC (19:10 MYT), which
// lands on the same date in both zones. The defect is therefore LATENT rather
// than live — and that measurement is what makes the fix verifiable, since
// output must be byte-identical on all 74 rows.
//
// frontend/src/lib/dates.ts is the same decision for the other package.

const { INSTITUTION_TZ } = require('../shared/facts');

// en-CA gives ISO-ordered YYYY-MM-DD, which is what every caller here wants and
// what the previous `toISOString().slice(0, 10)` produced. The formatter is
// built once: constructing an Intl.DateTimeFormat per call is measurably slower
// and this runs per row on reports that draw dozens.
const DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: INSTITUTION_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * `YYYY-MM-DD` in ISN's calendar, or a dash when there is no date.
 *
 * The dash rather than a fabricated today: an undated screening is a real state
 * (§45 leaves `assessedAt` nullable so an undated report still imports), and
 * printing today's date for it would assert something the record does not say.
 */
function isnDay(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return DAY.format(d);
}

/** Today, in ISN's calendar. Used for the "generated on" stamp on every report. */
function isnToday() {
  return DAY.format(new Date());
}

// `September 2026`, in ISN's calendar.
//
// For the MONTHLY digest and the rescreen reminder, which name the period they
// cover in their subject line and opening sentence. This mattered more than it
// looks: the digest ticks hourly and sends when the month marker turns over, so
// the send can land in the small hours Malaysian time — 03:00 on 1 September is
// 19:00 on 31 August in UTC, and the hosted process runs UTC. A monthly summary
// subject-lined with the previous month is wrong in the one field a reader
// files it by, and it is wrong exactly once a month, which is the pattern
// least likely to be noticed and most likely to confuse the record later.
const MONTH = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTION_TZ, month: 'long', year: 'numeric',
});

function isnMonth(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : MONTH.format(d);
}

module.exports = {
  isnDay, isnToday, isnMonth, INSTITUTION_TZ,
};
