// EVERY §N A SOURCE FILE CITES MUST EXIST IN THE DECISION LOG.
//
// WHY (2026-10-09, §158). This codebase is comment-heavy on purpose — the
// comments are much of what makes it defensible in a viva, and they lean on
// `DESIGN_DECISIONS.md` by section number. That only works while the number
// resolves. Four sections (§154–§157) were cited by six source files on the day
// they were written and none of them existed in the log: the code promised a
// reader an explanation that was not there.
//
// It is the documentation form of the defect this project keeps producing — a
// wrong answer that looks like a right one. A reader who follows `§155` and
// finds nothing does not conclude "the comment is stale"; they conclude they
// looked in the wrong place. And unlike a stale fact, nothing else catches it:
// the prose parses, the build is green, every other guard reads code.
//
// Deliberately ONE-DIRECTIONAL. A section nobody cites is perfectly fine —
// most of the log is history that no line of code needs to point at. Only the
// dangling citation is a defect.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LOG = path.join(ROOT, 'docs', 'DESIGN_DECISIONS.md');
const DIRS = [
  path.join(ROOT, 'backend', 'src'),
  path.join(ROOT, 'backend', 'scripts'),
  path.join(ROOT, 'frontend', 'src'),
];
const EXT = /\.(js|ts|tsx|css)$/;

// THE MUTATION REGISTRY IS EXEMPT, and it has to be: its whole job is to hold
// deliberately-wrong source, and this guard's OWN entry plants `§9999` in a
// `replace` string. Scanning it means the guard fails on the registry that
// proves the guard works. That is §118's trap — a source-text assertion whose
// needle is sitting in prose about the assertion — one layer further in.
const EXEMPT = new Set([path.join('backend', 'scripts', 'mutation-check.js')]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

// Headings look like `## 153.` or `## 94.2` — capture the integer part, which
// is what a citation names. Sub-sections (§70.4) resolve to their parent.
function sectionsInLog() {
  const text = fs.readFileSync(LOG, 'utf8');
  return new Set([...text.matchAll(/^##+\s+(\d+)[.\s]/gm)].map((m) => m[1]));
}

// `§155`, `§121.9`, `§4a`, and the `DESIGN_DECISIONS.md §96` form. The letter
// and decimal suffixes point at a sub-section of the same numbered entry, so
// only the leading integer has to resolve.
const CITE = /§\s?(\d+)/g;

describe('decision-log citations', () => {
  const have = sectionsInLog();

  test('the log has sections at all — a positive control', () => {
    // If the heading regex ever stops matching, every citation below would
    // "fail" for the wrong reason, or an empty set would make the main test
    // vacuous. This is the §119 lesson: a guard that cannot see its subject
    // must not read as clean.
    expect(have.size).toBeGreaterThan(100);
    expect(have.has('153')).toBe(true);
  });

  test('every §N cited in source resolves to a section', () => {
    const dangling = [];
    for (const dir of DIRS) {
      for (const file of walk(dir)) {
        if (EXEMPT.has(path.relative(ROOT, file))) continue;
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(CITE)) {
          if (!have.has(m[1])) {
            dangling.push(`${path.relative(ROOT, file)} cites §${m[1]}, which is not in DESIGN_DECISIONS.md`);
          }
        }
      }
    }
    // Decide which side is right before editing either: if the section was
    // renumbered, fix the citation; if it was never written, write it.
    expect([...new Set(dangling)]).toEqual([]);
  });
});
