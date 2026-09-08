// No invisible characters in source, in either package.
//
// WHY THIS EXISTS, and it is the most expensive lesson of 2026-09-06.
//
// A guard in numRound.test.js was written with `\b` word boundaries. The editing
// pass that produced it turned each one into a literal BACKSPACE byte (0x08). A
// regex containing a raw backspace matches a literal backspace, which never
// occurs in source code — so the pattern could not match anything, the guard
// reported "no offenders", and it stayed green while two real defects sat in the
// tree (SILENT_FAILURES 3l).
//
// It cost a long diagnosis because **every tool that would normally show it
// shows nothing**: `grep`, `sed`, an editor and a file read all render 0x08 as
// either nothing or as `\b`, visually identical to the intended escape. The file
// parsed. It linted. It passed. `od -c` on one line was what finally revealed it.
//
// This test is the cheap version of that diagnosis: it would have failed in
// seconds, naming the file, the line and the character.
//
// It is not only about that one bug. The same class covers a stray BOM in the
// middle of a file, a non-breaking space that looks exactly like a space but is
// not one to a parser or a regex, and zero-width characters that can hide a
// difference between two identifiers that render identically.
//
// FOUND ON FIRST RUN: four stray UTF-8 BOMs at the start of `middleware/auth.js`,
// `models/Athlete.js`, `models/MuscleFlag.js` and `models/User.js` — harmless to
// Node, which strips them, but invisible, inconsistent with the other 227 files,
// and exactly the sort of thing that makes a byte-level comparison lie. Removed.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const SCAN = [
  ['backend', 'src'], ['backend', 'tests'], ['backend', 'scripts'],
  ['frontend', 'src'], ['frontend', 'scripts'],
  ['shared'],
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(js|ts|tsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}

// Characters that should never appear in source here, with the name a failure
// message needs. Tab, newline and carriage return are excluded — they are how
// the files are written.
const FORBIDDEN = new Map([
  [0x00, 'NUL'], [0x07, 'BELL'], [0x08, 'BACKSPACE'], [0x0b, 'VERTICAL TAB'],
  [0x0c, 'FORM FEED'], [0x1b, 'ESCAPE'], [0x7f, 'DELETE'],
  [0xa0, 'NO-BREAK SPACE'], [0xad, 'SOFT HYPHEN'],
  [0x200b, 'ZERO-WIDTH SPACE'], [0x200e, 'LEFT-TO-RIGHT MARK'],
  [0x200f, 'RIGHT-TO-LEFT MARK'], [0x2028, 'LINE SEPARATOR'],
  [0x2029, 'PARAGRAPH SEPARATOR'], [0xfeff, 'BYTE ORDER MARK'],
]);

// The one file that must contain them, and the reason it must.
//
// `utils/pdfDraw.js` holds WIN_ANSI_SUBS, the table that REPLACES characters
// pdfkit's Helvetica cannot render (§30f). A no-break space and a BOM appear
// there as regex literals — they are the characters being stripped OUT, so the
// file that handles this problem is the one file allowed to contain it.
//
// The exemption INVALIDATES ITSELF: if that table ever goes away, the assertion
// below fails and the exemption has to be re-argued rather than silently
// covering a real defect. An allowlist nobody re-checks is how exemptions rot.
const EXEMPT = path.join('src', 'utils', 'pdfDraw.js');

describe('no invisible characters in source', () => {
  const files = SCAN.flatMap((parts) => walk(path.join(ROOT, ...parts)));

  it('scans both packages', () => {
    // A floor, so a broken walk cannot pass by finding nothing.
    expect(files.length).toBeGreaterThan(150);
  });

  it('can detect the character that caused this', () => {
    // The canary. A scan that cannot find what it is looking for is theatre —
    // which is precisely the failure this file exists because of.
    const planted = `const re = /=>\\s*${String.fromCharCode(8)}(?:x)/;`;
    const hits = [...planted].filter((ch) => FORBIDDEN.has(ch.codePointAt(0)));
    expect(hits.map((c) => FORBIDDEN.get(c.codePointAt(0)))).toEqual(['BACKSPACE']);
  });

  it('finds none in any source file', () => {
    const offences = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f);
      if (rel.endsWith(EXEMPT)) continue;
      const src = fs.readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        for (const ch of line) {
          const c = ch.codePointAt(0);
          if (FORBIDDEN.has(c)) {
            offences.push(`${rel}:${i + 1} contains ${FORBIDDEN.get(c)} (U+${c.toString(16).toUpperCase().padStart(4, '0')})`);
            break; // one report per line is enough to find it
          }
        }
      });
    }
    // If this fails: the character is invisible in your editor. Use `od -c` on
    // the named line. It is almost always an editing pass that turned an escape
    // sequence into the character it denotes — `\b` into a backspace, `\n` into
    // a newline. Rewrite the line with an editor rather than a shell heredoc.
    expect(offences).toEqual([]);
  });

  it('the pdfDraw exemption is still justified by what that file does', () => {
    // Self-invalidating: the exemption exists only for the substitution table.
    const src = fs.readFileSync(path.join(ROOT, 'backend', EXEMPT), 'utf8');
    expect(src).toMatch(/WIN_ANSI_SUBS/);
    expect(src).toMatch(/function winAnsiSafe/);
  });
});
