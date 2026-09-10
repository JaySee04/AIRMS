// Every corpus scanner must prove it can find something.
//
// THE PROBLEM THIS SOLVES, which the mutation registry did not.
//
// `npm run mutate` verifies the guards somebody REGISTERED. A new guard with no
// entry is exactly as unverified as before — and a hand-kept list is precisely
// what went stale in SILENT_FAILURES 3o, where an access audit claimed "all 49
// endpoints" against a system that had grown to 62.
//
// So this does not keep a list. It DERIVES the set: a test that enumerates a
// directory and asserts its offender list is empty is a corpus scanner, and a
// corpus scanner that has never been shown finding an offender is indis-
// tinguishable from one that cannot. That is 3l exactly — a guard whose pattern
// could not match anything, reporting "no offenders" while two real defects sat
// in the tree.
//
// Because the set is computed, a scanner written next month is covered the day
// it is written, by nobody remembering anything.
//
// WHAT COUNTS AS A POSITIVE CONTROL: the scanner is run against an input known
// to be bad, and asserted to report it. A CORPUS FLOOR IS NOT ONE — asserting
// "we scanned more than 150 files" proves the walk works, not that the detector
// does. `sourceHygiene` has both and is the model: a floor, and a canary that
// runs the real predicate over a planted backspace.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc);
    else if (/\.test\.(js|ts|tsx)$/.test(e.name)) acc.push(f);
  }
  return acc;
}

const TEST_FILES = [
  ...walk(path.join(ROOT, 'backend', 'tests')),
  ...walk(path.join(ROOT, 'frontend', 'src')),
];

// It ENUMERATES a corpus (not just reads one fixture) …
const ENUMERATES = /readdirSync/;
// … and concludes by asserting it found nothing.
const ASSERTS_NO_OFFENDERS = /toEqual\(\[\]\)|toHaveLength\(0\)|\.not\.toContain\(|not\.toMatch\(/;

// … and somewhere shows the detector reporting a planted offender.
//
// Matched on INTENT markers rather than on assertion shapes, because the shapes
// differ per scanner and a loose shape match (`toBe(0)`, `toBeGreaterThan(0)`)
// pulled in ordinary logic tests when this was first calibrated.
const POSITIVE_CONTROL = /canary|MUST_CATCH|planted|positive control|can detect|would catch|proves it can/i;

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

const scanners = TEST_FILES
  .map((f) => ({ f, src: fs.readFileSync(f, 'utf8') }))
  .filter(({ src }) => ENUMERATES.test(src) && ASSERTS_NO_OFFENDERS.test(src));

describe('every corpus scanner can be shown finding something', () => {
  it('found the corpus scanners at all', () => {
    // Without this, a broken derivation makes the check below pass by having
    // nothing to check — the same vacuous-pass shape it exists to prevent.
    expect(scanners.length).toBeGreaterThanOrEqual(8);
  });

  it('this check can itself detect a scanner with no control', () => {
    // The canary for the canary rule. A file that enumerates and asserts
    // emptiness, with no positive control, must be classified as missing one.
    const fake = `
      const { readdirSync } = require('fs');
      it('finds nothing', () => { expect(offenders).toEqual([]); });
    `;
    expect(ENUMERATES.test(fake) && ASSERTS_NO_OFFENDERS.test(fake)).toBe(true);
    expect(POSITIVE_CONTROL.test(fake)).toBe(false);
  });

  // Scanners that predate this rule and do not yet have a control. This is a
  // DEBT REGISTER, not an exemption list: every entry is a scanner that can
  // currently report "all clear" with nothing proving it could report anything
  // else. It may only shrink.
  //
  // It is safe in the way a hand-kept list normally is not, because the SET is
  // derived: a scanner written tomorrow is not on this list, so it fails on the
  // day it is written. Removing an entry requires adding a real control, and
  // the test below refuses an entry that has become untrue — so the list cannot
  // quietly outlive its reason, which is how the 3o endpoint count rotted.
  // EMPTY as of 2026-09-10. It was six entries for about an hour, which is the
  // right lifetime for a debt register: it existed to make the gap visible, not
  // to make it comfortable. Every corpus scanner in the project now has a
  // control that runs its real predicate over a planted offender.
  //
  // Adding an entry here is a deliberate, reviewable act. It is not a place to
  // put a scanner you did not feel like verifying.
  const AWAITING_CONTROL = [];

  it('the debt register is still accurate', () => {
    const byRel = new Map(scanners.map((s) => [rel(s.f), s.src]));
    const stale = AWAITING_CONTROL.filter((r) => {
      const src = byRel.get(r);
      // Gone, renamed, or no longer a scanner — or it has since gained a
      // control and the entry is now a lie that hides a working guard.
      return src === undefined || POSITIVE_CONTROL.test(src);
    });
    expect(stale).toEqual([]);
  });

  it('every one of them has a positive control', () => {
    const missing = scanners
      .filter(({ src }) => !POSITIVE_CONTROL.test(src))
      .map(({ f }) => rel(f))
      .filter((r) => !AWAITING_CONTROL.includes(r));

    // If this fails: the named file scans a corpus and asserts it found no
    // offenders, with nothing anywhere proving it could find one. Add a case
    // that runs the SAME predicate over a planted offender and asserts it is
    // reported. A floor on how many files were scanned does not count — that
    // proves the walk works, not the detector.
    expect(missing).toEqual([]);
  });
});
