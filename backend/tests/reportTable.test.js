// CHAPTER 4'S USE-CASE TABLE MUST AGREE WITH ITSELF.
//
// `docs/fyp/REPORT_TABLE_4-1.md` is, by CLAUDE.md, "the authority for
// Chapter 4" — the graded report's functional-requirements table. On
// 2026-09-12 it held three contradictions, all invisible to every other guard
// in this repo because they are properties of prose:
//
//   * the sentence that counts the use cases said 47; the table had 60. UC-48–60
//     had been appended without returning to the sentence that counts them.
//   * a note asserted "Four roles ship" while the table itself listed Executive
//     as an actor on four rows. Executive had existed since 2026-08-08.
//   * nothing shipped after 2026-08-06 had a use case at all — the four decision
//     aids, the watchlist, the roster triage pane, the instrument's written
//     summary, on-screen seasonality, programme-tier comparison, read-auditing
//     and the named recall checklist. Eleven capabilities, five weeks, a graded
//     document describing a system that no longer existed.
//
// The first two are what this file pins, because they are the two that a
// machine can settle. The third cannot be tested — no guard knows what has been
// built but not written up — which is exactly why the count check matters: the
// count is the tripwire that makes somebody look.
//
// A DOC TEST IN THE BACKEND SUITE, for the same reason `systemMap` and
// `sharedFacts` are: it is where the repo already keeps "a committed file is
// stale" checks, and jest is the thing that runs before a commit.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'docs', 'fyp', 'REPORT_TABLE_4-1.md');
const src = fs.readFileSync(FILE, 'utf8');

// SCOPED TO ONE SECTION, and the first version was not — it matched 93 rows
// against a 71-row table, because the provenance table above and Appendix C's
// old-to-new mapping below both carry `| UC-n |` cells too. A count assembled
// from three tables is not a count of anything.
//
// Sliced between headings rather than on prose, and the start heading is
// asserted UNIQUE: DESIGN_DECISIONS §68.4 is a span deleted because its end
// marker also occurred inside the text being inserted.
const HEADING = '## Table 4.1: Functional Requirements';

function tableSection() {
  const occurrences = src.split(HEADING).length - 1;
  expect(occurrences).toBe(1);
  const from = src.indexOf(HEADING) + HEADING.length;
  const rest = src.slice(from);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every `| UC-n |` row of the functional-requirements table, in file order. */
function ucRows() {
  return [...tableSection().matchAll(/^\|[^|\n]*\|\s*UC-(\d+)\s*\|([^|\n]*)\|/gm)]
    .map((m) => ({ n: Number(m[1]), title: m[2].trim() }));
}

describe('Chapter 4 use-case table', () => {
  const rows = ucRows();

  it('parses — the floor, before any claim about what it contains', () => {
    // Without this, a changed table format would make every assertion below
    // pass against zero rows. That failure mode has a name in this repo
    // (SILENT_FAILURES 3l) and this is the standing answer to it.
    expect(rows.length).toBeGreaterThan(40);
    expect(rows[0].n).toBe(1);
    expect(rows[0].title).toBe('Login');
  });

  it('numbers its use cases 1..N with no gap and no duplicate', () => {
    const ns = rows.map((r) => r.n);
    expect(new Set(ns).size).toBe(ns.length); // no duplicate id
    expect(ns).toEqual([...ns].sort((a, b) => a - b)); // in order
    expect(ns[ns.length - 1]).toBe(ns.length); // contiguous from 1
  });

  it('every row has a title', () => {
    // An untitled row renders as an empty cell in the submitted document.
    rows.forEach((r) => expect(r.title.length).toBeGreaterThan(2));
  });

  // THE TRIPWIRE. The prose states a count; the table is the count.
  it('the stated count matches the table', () => {
    const m = src.match(/This table now lists \*\*(\d+)\*\*/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(rows.length);
  });

  it('names all five roles that ship, not the four it used to', () => {
    // The contradiction was inside one document: a note said four while the
    // table listed Executive as an actor. Both halves are asserted, so fixing
    // one and not the other fails.
    expect(src).toMatch(/\*\*Five roles ship\*\*/);
    ['Athlete', 'Medical Staff', 'Administrator', 'Coach', 'Executive']
      .forEach((role) => expect(src).toContain(role));
    expect(src).not.toMatch(/\*\*Four roles ship\*\*/);
  });

  // ── Claims in the prose that the CODE can settle ────────────────────────
  //
  // Added after checking my own work on 2026-09-12 and finding two of these
  // wrong in the same commit that introduced them. Nothing can verify a
  // use-case description in general; these two are exceptions, because the
  // document states a number and a role list that exist as constants.

  it('states the invitation window the code actually uses', () => {
    // UC-49 said "expires after seven days" in the SAME COMMIT that changed the
    // window to 24 hours (§85b). The table was revised and the row describing
    // the thing that changed was not.
    const { INVITE_CODE_TTL_MIN } = require('../src/utils/resetCodes');
    const row = ucRows().find((r) => r.title === 'Activate Account');
    expect(row).toBeDefined();
    const section = tableSection();
    const line = section.split('\n').find((l) => l.includes('| Activate Account |'));
    expect(line).toBeDefined();
    const m = line.match(/expires after (\d+) (hours|days)/);
    expect(m).not.toBeNull();
    const statedMinutes = Number(m[1]) * (m[2] === 'days' ? 24 * 60 : 60);
    expect(statedMinutes).toBe(INVITE_CODE_TTL_MIN);
  });

  it('does not name an actor who cannot reach the use case', () => {
    // UC-49 listed "Athlete" as able to activate an account, and no athlete
    // account can ever be invited — `INVITABLE_ROLES` excludes it deliberately
    // (JC, 2026-08-23) because an athlete account also needs a roster record.
    // That one predates this revision by five weeks; it is pinned here because
    // it is the same shape as the error I made one row away.
    // Read from the route SOURCE, not required — `routes/users.js` builds a
    // router and pulls in the models, which is why accountLifecycle.test.js
    // parses it the same way.
    const routeSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'users.js'), 'utf8',
    );
    const declared = routeSrc.match(/const INVITABLE_ROLES = (\[[^\]]+\])/);
    expect(declared).not.toBeNull();
    const INVITABLE_ROLES = JSON.parse(declared[1].replace(/'/g, '"'));
    expect(INVITABLE_ROLES.length).toBeGreaterThan(1); // floor

    const line = tableSection().split('\n').find((l) => l.includes('| Activate Account |'));
    const actors = line.split('|').filter(Boolean).pop().trim();
    expect(actors.length).toBeGreaterThan(0); // floor: the column was found
    const label = { medical: 'Medical Staff', admin: 'Administrator', coach: 'Coach', executive: 'Executive' };
    INVITABLE_ROLES.forEach((r) => expect(actors).toContain(label[r]));
    // And the reverse, which is the direction that was wrong.
    if (!INVITABLE_ROLES.includes('athlete')) expect(actors).not.toContain('Athlete');
  });

  // Actors are what the report is read for, so a role that reaches nothing is
  // either a documentation gap or a role nobody needed.
  it('every shipped role is the actor on at least one use case', () => {
    const actorColumn = [...tableSection().matchAll(/^\|.*\|\s*UC-\d+\s*\|.*\|([^|\n]*)\|\s*$/gm)]
      .map((m) => m[1]);
    expect(actorColumn.length).toBe(rows.length);
    const all = actorColumn.join(' · ');
    ['Athlete', 'Medical Staff', 'Administrator', 'Coach', 'Executive', 'System']
      .forEach((role) => expect(all).toContain(role));
  });
});
