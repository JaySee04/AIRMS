// The page and the document cannot quote different KPIs.
//
// `utils/programmeActivity.js` was extracted for exactly one reason, stated at
// the top of that file: "Two code paths computing the programme's KPIs would be
// free to disagree, and the report is precisely the artefact someone files or
// signs off." Sharing the util guarantees the NUMBERS agree. It guarantees
// nothing about whether the report DRAWS them.
//
// THE DEFECT THIS EXISTS TO PREVENT, which happened on 2026-09-14: two new KPI
// groups (§103 escalation response, §104 squad compliance) were added to the
// util and to the page, and the PDF silently kept printing the older, smaller
// set. Nothing failed. The report rendered, streamed 200, and quoted a strictly
// poorer set of facts than the screen it claims to mirror — found by fetching
// the PDF and reading it, not by any test.
//
// So this reads BOTH files as text and pins them to each other: every top-level
// key the util returns must be referenced by the activity-report handler.
//
// A SOURCE check because the backend suites are DB-free (CI runs no MySQL), so
// the util cannot be called here. The same technique as
// tests/athleteDisclosure.test.js.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const UTIL = read(path.join('utils', 'programmeActivity.js'));
const REPORT = read(path.join('routes', 'screeningReports.js'));

/**
 * Top-level keys of the object `programmeActivityData` returns.
 *
 * Taken from the FULL return (the one at the end of the function), not the
 * empty-roster early return, because the early return is a subset by design.
 */
function returnedKeys() {
  // The last `return {` in the file is the full payload; the early return for an
  // empty roster comes before it.
  const idx = UTIL.lastIndexOf('\n  return {');
  if (idx === -1) throw new Error('could not locate the payload return in programmeActivity.js');
  const tail = UTIL.slice(idx);
  const end = tail.indexOf('\n  };');
  if (end === -1) throw new Error('could not locate the end of the payload return');
  const body = tail.slice(0, end);

  const keys = new Set();
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    // `foo: bar` or shorthand `foo,` — both at ONE level of nesting only, which
    // is why the match is anchored to the line's own indentation.
    const m = line.match(/^ {4}([a-zA-Z][\w]*)\s*[:,]/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe('the programme-activity PDF quotes every KPI the util produces', () => {
  const keys = returnedKeys();

  // WHAT THIS COVERS, AND WHAT IT DOES NOT — stated because the first version
  // of this test claimed more than it checked.
  //
  // The payload is `{ ...result, escalationResponse, sportCompliance, coverage,
  // recall, scope }`. Only the DIRECT keys are extracted here. The spread comes
  // from `screeningPeriods()` and carries grain / periods / betweenTests /
  // seasonality / reliability, which the report draws through named helpers
  // (`throughputChart`, `periodTable`, `betweenTestsBlock`, `seasonTable`)
  // rather than by key.
  //
  // That is the right scope, because the defect being guarded is a key added
  // DIRECTLY to this payload and forgotten by the report — which is exactly
  // what happened with §103 and §104. A key added to screeningPeriods is a
  // different surface with its own long-standing drawing code.
  //
  // The first attempt asserted `seasonality` would be found and it was not,
  // because it arrives through the spread. The canary caught the over-claim
  // before the test could ship pretending to cover it.
  it('the payload really does spread screeningPeriods, so the scope note holds', () => {
    const idx = UTIL.lastIndexOf('\n  return {');
    expect(UTIL.slice(idx, idx + 200)).toMatch(/\.\.\.result/);
  });

  // THE CANARY. A parser that silently finds one key and reports "all covered"
  // is DESIGN_DECISIONS §56.3 happening again — the first route parser found 15
  // of 59 endpoints and rendered a perfectly plausible table. If this number
  // falls, the extraction broke, not the report.
  it('extracted a plausible number of DIRECT payload keys', () => {
    expect(keys.size).toBeGreaterThanOrEqual(5);
  });

  it('found the direct keys this test was written against', () => {
    // Named explicitly so a RENAME shows up as a failure here rather than as a
    // silently shrinking coverage claim above.
    for (const k of ['coverage', 'recall', 'escalationResponse', 'sportCompliance']) {
      expect([...keys]).toContain(k);
    }
  });

  // `scope` and `grain` are report METADATA rather than KPIs — the cover page
  // takes them through its own path — and `periods` / `betweenTests` /
  // `reliability` are drawn by named helpers rather than by key. Everything else
  // must be referenced by name in the handler.
  const METADATA = new Set(['scope', 'grain']);

  it.each([...returnedKeys()].filter((k) => !METADATA.has(k)))(
    'the report references %s',
    (key) => {
      // Referenced at all — destructured, read off `data.`, or passed to a
      // drawing helper. This cannot prove the value is DRAWN correctly; it
      // proves the report did not forget the group exists, which is the
      // failure that actually occurred.
      expect(REPORT).toMatch(new RegExp(`\\b${key}\\b`));
    },
  );
});

describe('the squad-compliance caveat reaches the printed page', () => {
  it('the report prints the caveat from the PAYLOAD, not a copy of its own', () => {
    // A second copy of the sentence in this file would drift from the one on
    // screen, and the whole point of carrying it in the payload (§104) is that
    // both surfaces state the same limit.
    expect(REPORT).toMatch(/sc\.caveat/);
    // And it must not have been re-typed here.
    expect(REPORT).not.toMatch(/cannot separate them, and a squad that was never booked/);
  });
});
