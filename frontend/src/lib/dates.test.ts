// One table of instants, run through BOTH packages' date rendering.
//
// Same shape as num.test.ts and for the same reason: these are two
// implementations of one decision, and the failure mode is that they quietly
// disagree. Here the decision is "which calendar day is this instant?", and the
// answer must be ISN's, on every surface — the dashboard, the audit table and
// the printed report.
//
// THE CASE THE DATABASE DOES NOT CONTAIN. Every seeded `assessedAt` sits at
// 19:10 Malaysian time, which is the same date in UTC, so no screening exercises
// the boundary. The rows that DO cross are timestamps of real evening actions —
// 45 of 537 measured — and a test that only used real data would therefore miss
// the screening case entirely. The table below supplies instants either side of
// midnight in Kuala Lumpur on purpose.
// THIS SUITE RUNS UNDER UTC, DELIBERATELY, AND THAT IS LOAD-BEARING.
//
// The first version of this file did not, and mutation testing exposed it as
// nearly worthless: dropping `timeZone: INSTITUTION_TZ` from either formatter —
// the exact defect being fixed — was caught by NOTHING. The reason is that the
// development machine's own zone is Asia/Kuala_Lumpur, so a formatter that falls
// back to the system default produces byte-identical output. Every assertion
// passed for the wrong reason, and would have kept passing until the code ran on
// a UTC host, which is precisely where the hosted API runs.
//
// So the process is forced into a foreign zone before the modules load. `require`
// rather than `import` because ESM imports hoist above statements, and these
// modules build their Intl formatters at module scope — the assignment has to
// happen first or it changes nothing.
// TZ is pinned to UTC for the whole run by jest.globalSetup.js — see the note
// there for why setting it HERE does not work (Jest resolves the zone before
// this module is evaluated, which the meta-assertions below caught).

const { isnDayIso, isnDay, isnDateTime } = require('./dates') as typeof import('./dates');
const be = require('../../../backend/src/utils/dates.js');
const { INSTITUTION_TZ } = require('./shared/facts') as typeof import('./shared/facts');

describe('the harness can actually detect the bug', () => {
  // Without this, the suite below is theatre. It asserts that the environment
  // differs from the institution's, which is the only condition under which
  // "the zone is explicit" and "the zone happens to be right" give different
  // answers. If someone runs the suite on a Malaysian machine without the TZ
  // override, this fails and says why rather than going quietly green.
  it('is running in a zone that is NOT the institution zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(INSTITUTION_TZ);
  });

  it('would render the boundary case differently without an explicit zone', () => {
    // The control: same instant, no timeZone given, in this process. If this
    // ever equals the institution answer, the override above has stopped
    // working and every assertion below is unguarded again.
    const ambient = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date('2026-09-06T16:00:00Z'));
    expect(ambient).toBe('2026-09-06');
    expect(isnDayIso('2026-09-06T16:00:00Z')).toBe('2026-09-07');
  });
});

// Kuala Lumpur is UTC+8 with no daylight saving, which is why these are stable.
const CASES: Array<{ iso: string; day: string; why: string }> = [
  { iso: '2026-09-06T11:10:00Z', day: '2026-09-06', why: 'the seeded screening time — same day in both zones' },
  { iso: '2026-09-06T15:59:59Z', day: '2026-09-06', why: '23:59 MYT — last moment of the institution day' },
  { iso: '2026-09-06T16:00:00Z', day: '2026-09-07', why: '00:00 MYT — the very next institution day' },
  { iso: '2026-08-24T19:31:02Z', day: '2026-08-25', why: 'a real audit row: 03:31 MYT, printed as the 24th before this fix' },
  { iso: '2026-09-06T23:59:59Z', day: '2026-09-07', why: 'late UTC evening is already tomorrow at ISN' },
  { iso: '2026-01-01T16:00:00Z', day: '2026-01-02', why: 'the boundary also moves the YEAR' },
  { iso: '2025-12-31T15:00:00Z', day: '2025-12-31', why: '23:00 MYT on new year’s eve, still the old year' },
];

describe('both packages agree which day an instant belongs to', () => {
  it.each(CASES)('$iso -> $day  ($why)', ({ iso, day }) => {
    expect({ frontend: isnDayIso(iso), backend: be.isnDay(iso) })
      .toEqual({ frontend: day, backend: day });
  });

  it('crosses the date line where UTC does NOT — the whole point', () => {
    // If someone reverts either implementation to toISOString()/local time, this
    // is the assertion that fails: UTC says the 6th, ISN says the 7th.
    const instant = '2026-09-06T16:00:00Z';
    expect(instant.slice(0, 10)).toBe('2026-09-06'); // what UTC would have shown
    expect(isnDayIso(instant)).toBe('2026-09-07');
    expect(be.isnDay(instant)).toBe('2026-09-07');
  });
});

describe('an absent date stays absent', () => {
  // A screening may legitimately carry no assessedAt (§45 leaves it nullable so
  // an undated report still imports). Rendering today's date for it would assert
  // something the record does not say — the §54 rule, applied to dates.
  it.each([null, undefined, '', 'not a date', NaN])('%p renders as the fallback', (v) => {
    expect(isnDayIso(v as never)).toBe('—');
    expect(isnDay(v as never)).toBe('—');
    expect(isnDateTime(v as never)).toBe('—');
    expect(be.isnDay(v as never)).toBe('—');
  });

  it('lets a caller choose its own wording for absence', () => {
    // routes/screenings.js says "unknown date" inside a sentence, where a dash
    // would read as a typo.
    expect(be.isnDay(null, 'unknown date')).toBe('unknown date');
    expect(isnDay(null, '')).toBe('');
  });
});

describe('the human forms stay readable', () => {
  it('renders a prose day and a timestamp in the institution zone', () => {
    // The DAY and the YEAR are asserted exactly; the month ABBREVIATION is not.
    // This runtime's ICU renders en-GB September as "Sept", others as "Sep", and
    // that varies with the Node build rather than with anything this code
    // decides — the previous `toLocaleDateString('en-GB', …)` produced whichever
    // the runtime gave too, so nothing visible changed. Pinning it would make
    // the suite fail on a different host for a reason unrelated to the property
    // under test, which is the ZONE.
    expect(isnDay('2026-09-06T16:00:00Z')).toMatch(/^7 Sept? 2026$/);
    // 00:00 on the 7th in Kuala Lumpur — the numeric forms have no such
    // ambiguity, so they are pinned exactly.
    expect(isnDateTime('2026-09-06T16:00:00Z')).toBe('07/09/2026 00:00');
  });

  it('keeps the ISO form sortable, which is why the audit table uses it', () => {
    const days = ['2026-09-06T16:00:00Z', '2026-01-01T16:00:00Z', '2026-09-06T11:10:00Z']
      .map((d) => isnDayIso(d));
    expect([...days].sort()).toEqual(['2026-01-02', '2026-09-06', '2026-09-07']);
  });
});
