// The two packages must date a screening in the SAME calendar.
//
// The backend buckets a screening into a month/quarter/year; the frontend
// prints its date on the row beneath the chart. Those were two different
// calendars: `getUTC*()` on one side, `toLocaleString(undefined, …)` — the
// viewer's zone — on the other. On the hosted instance the API runs in UTC and
// a clinician's browser runs in MYT (UTC+8), so a screening taken between 00:00
// and 07:59 local falls on the previous UTC day; across a month end the same
// row was drawn in one column and dated into the next month.
//
// Seasonality is where it would have hurt most — the docs call it the one
// output whose plausible failure is a confidently wrong institutional decision.
//
// Nothing on record today triggers it (all 74 screenings sit at 11:00 UTC =
// 19:00 MYT, and re-bucketing moved none of them), which is exactly why it
// needs a test rather than a look at the dashboard.
import fs from 'fs';
import path from 'path';
import { INSTITUTION_TZ, fmtScreeningDate, GRAINS } from './periods';

/**
 * What the BACKEND actually runs on, read from the file it imports.
 *
 * Both packages now generate their copy from shared/facts.js, so this is no
 * longer scraping a hand-written literal out of a source file — but it is still
 * worth asserting end to end. The freshness tests prove each generated file
 * matches the source; this proves the value the frontend uses is the value the
 * backend buckets with, which is the property anybody actually cares about.
 */
const backendFacts = (): Record<string, unknown> => {
  const p = path.join(__dirname, '..', '..', '..', 'backend', 'src', 'shared', 'facts.js');
  expect(fs.existsSync(p)).toBe(true);
  return require(p);
};

describe('the institution calendar', () => {
  it('matches the backend, which is the thing that buckets', () => {
    expect(INSTITUTION_TZ).toBe(backendFacts().INSTITUTION_TZ);
  });

  it('is a zone the runtime actually knows', () => {
    // A typo'd IANA name throws at format time, which would surface as a blank
    // date column rather than an error anybody attributes to this constant.
    expect(() => new Intl.DateTimeFormat('en-GB', { timeZone: INSTITUTION_TZ }).format(new Date()))
      .not.toThrow();
  });
});

describe('fmtScreeningDate', () => {
  it('dates the boundary instant in ISN\'s calendar, not the runtime\'s', () => {
    // 2025-07-31T17:00Z is 1 August 01:00 in Kuala Lumpur. Under the old
    // formatter this read as 31 July on a UTC host and 1 August on a KL laptop —
    // the same screening, two dates, depending on who opened the page.
    const out = fmtScreeningDate('2025-07-31T17:00:00.000Z');
    expect(out).toMatch(/1 Aug 2025/);
    expect(out).not.toMatch(/Jul/);
  });

  it('dates a morning screening on the day it happened at ISN', () => {
    // 07:00 MYT on 1 August is 23:00 UTC on 31 July — the realistic case, since
    // an institute screens athletes early.
    expect(fmtScreeningDate('2025-07-31T23:00:00.000Z')).toMatch(/1 Aug 2025/);
  });

  it('is stable wherever the process happens to be running', () => {
    // Same instant, formatted twice with TZ forced either side of it. The
    // output must not move, which is the property the pin exists for.
    const iso = '2025-07-31T17:00:00.000Z';
    const prev = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const asUtc = fmtScreeningDate(iso);
      process.env.TZ = 'America/New_York';
      const asNy = fmtScreeningDate(iso);
      expect(asUtc).toBe(asNy);
      expect(asUtc).toMatch(/1 Aug 2025/);
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  });

  it('still says Undated for a missing timestamp', () => {
    expect(fmtScreeningDate(null)).toBe('Undated');
    expect(fmtScreeningDate(undefined)).toBe('Undated');
  });
});

describe('grain vocabulary', () => {
  it('matches the backend GRAINS list', () => {
    expect(GRAINS.map((g) => g.key)).toEqual(backendFacts().GRAINS);
  });

  it('gives every grain a label — a missing one renders as blank, not as an error', () => {
    GRAINS.forEach((g) => expect(g.label).toBeTruthy());
  });
});
