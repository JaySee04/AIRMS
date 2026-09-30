// A PLANTED EDIT MUST PROVE IT LANDED.
//
// THE CLASS. Half the guards in this repo work by breaking something on purpose
// and checking a check notices. All of them rest on an unstated assumption: that
// the edit applied. `String.replace` with a needle that is not present returns
// the string unchanged and reports nothing, so the run breaks nothing, the check
// passes, and the output says the guard is healthy.
//
// Five instances, three of them in one session (§121.12 lists them). The common
// shape is not a typo — it is that nobody checked the needle was there:
//   `text.replace('(74)', '(99)')` against a compressed PDF stream;
//   `cssText.includes('#eef0f3')` against a colour Chrome normalises to rgb();
//   `sed 's/  \['coach'.../` against an entry that is not at line start.
//
// scripts/lib/plantedEdit.js is the answer and scripts/mutation-check.js is the
// one place that already had the discipline inline. This test makes it the rule:
// a script that plants an edit either goes through the helper, or states in
// writing why it does not need to.
//
// DERIVED, NOT LISTED. Like guardCanaries.test.js, this computes the set rather
// than keeping a roster — a hand-kept list of things to check is exactly what
// went stale in SILENT_FAILURES 3o. A canary written next month is covered the
// day it is written.
const fs = require('fs');
const path = require('path');
const { plant, plantInBuffer } = require('../scripts/lib/plantedEdit');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = [
  path.join(ROOT, 'backend', 'scripts'),
  path.join(ROOT, 'frontend', 'scripts'),
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc);
    else if (/\.js$/.test(e.name)) acc.push(f);
  }
  return acc;
}

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

/** A script is PLANTING an edit if it deliberately corrupts input to test a check. */
const PLANTS = /--canary|CANARY|planted|plantInBuffer|\bplant\(/;
/** The unguarded shapes: a literal replace, or an injected stylesheet. */
const BARE_REPLACE = /\.replace\(\s*['"`]/;
/** Evidence that the edit is verified to have landed. */
const PROVES = /plantInBuffer|\bplant\(|expect:\s*\d|split\([^)]*\)\.length\s*-\s*1|getComputedStyle|elementsFromPoint/;

describe('a planted edit proves it landed', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it('finds a real corpus of scripts', () => {
    // Without this, a broken walk would make every assertion below vacuous —
    // which is the same defect the file is about.
    expect(files.length).toBeGreaterThan(8);
  });

  it('every script that plants an edit verifies the edit applied', () => {
    const offenders = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      if (!PLANTS.test(s)) continue;
      if (!BARE_REPLACE.test(s)) continue;          // no literal replace to worry about
      if (PROVES.test(s)) continue;                 // proves it landed somehow
      offenders.push(rel(f));
    }
    // If this fails: route the edit through scripts/lib/plantedEdit.js, or — for
    // a browser canary, where the edit is a stylesheet rather than a string —
    // verify by EFFECT (does a real element compute to the planted value), which
    // is what verify-contrast.js does after getting it wrong once.
    expect(offenders).toEqual([]);
  });
});

describe('plantedEdit itself', () => {
  it('replaces when the needle occurs exactly as promised', () => {
    const { text, hits } = plant('a b c', 'b', 'X', { expect: 1 });
    expect(text).toBe('a X c');
    expect(hits).toBe(1);
  });

  it('REFUSES a needle that is absent — the whole point', () => {
    expect(() => plant('a b c', 'zzz', 'X', { expect: 1 })).toThrow(/did NOT land/);
  });

  it('refuses a needle that occurs more often than promised', () => {
    // 74 appears twice in the synthetic fixture — as Total Score and as a
    // subitem cell — and a bare replace would have changed the wrong one.
    expect(() => plant('74 and 74', '74', '99', { expect: 1 })).toThrow(/occurs 2 time\(s\), expected 1/);
  });

  it('replaces every occurrence when asked, and only then', () => {
    const { text } = plant('74 and 74', '74', '99', { expect: 2, all: true });
    expect(text).toBe('99 and 99');
  });

  it('requires `expect` rather than defaulting it', () => {
    // A caller who has not counted the needle is the caller about to plant an
    // edit in the wrong place, so there is deliberately no default.
    expect(() => plant('a', 'a', 'b', {})).toThrow(/`expect` is required/);
    expect(() => plant('a', 'a', 'b')).toThrow(/`expect` is required/);
  });

  it('round-trips a Buffer byte for byte, including bytes above 0x7F', () => {
    // latin1, not utf8: a PDF is full of high bytes and utf8 would corrupt them
    // on the way back out, which would break the fixture for reasons unrelated
    // to the value under test.
    const buf = Buffer.from([0x3c, 0x33, 0x31, 0x33, 0x38, 0x3e, 0xff, 0x80, 0x00]);
    const { buffer } = plantInBuffer(buf, '<3138>', '<3939>', { expect: 1 });
    expect(buffer.length).toBe(buf.length);
    expect([...buffer.slice(6)]).toEqual([0xff, 0x80, 0x00]);
    expect(buffer.toString('latin1')).toContain('<3939>');
  });

  it('refuses a binary replacement of a different length', () => {
    // A PDF carries byte offsets in its xref table, so a length change produces
    // a file that parses differently for reasons that have nothing to do with
    // the test.
    expect(() => plantInBuffer(Buffer.from('<3138>'), '<3138>', '<9>', { expect: 1 }))
      .toThrow(/same length/);
  });
});
