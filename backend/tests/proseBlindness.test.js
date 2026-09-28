// A SOURCE-READING TEST MUST BE SATISFIED BY CODE, NOT BY ITS OWN DOCUMENTATION.
//
// WHY (2026-09-28, §118). This repo has ~13 tests that read a source file as
// TEXT and assert on it — the technique that catches the `winAnsiSafe` shape,
// where a function is defined, exported, unit-tested and never called. It is a
// good technique with one failure mode nobody was checking: **the needle can be
// sitting in a comment.**
//
// Twice in one day, it was:
//
//   §115  `visionThrottle.test.js` asserted the vision return block contains
//         `providerCalls: 1`. `npm run mutate` flipped the code to 0 and the
//         test still passed — the COMMENT above that line read "`providerCalls:
//         1` alone also matches summaryFromPage1".
//   §117.5  `npm run map` widened its env-var scan to `env.NAME`. The comment
//         explaining the widening contains the words "reads `env.NAME`", so the
//         next run added an environment variable called NAME.
//
// Both were found by accident — one by a mutation run, one by reading a diff.
// This asks the question of every such assertion, every time.
//
// WHAT IT DOES NOT DO: it only sees assertions made directly on a variable that
// holds file text. A test that slices the text first — `routeLine(...)` in
// visionThrottle.test.js — is invisible here, and that is stated rather than
// papered over. The floor below is what stops the derivation silently finding
// nothing.

const fs = require('fs');
const path = require('path');

const TESTS = __dirname;

/**
 * Strip `//` and block comments.
 *
 * `\r\n` normalised FIRST. `.` does not match `\r`, so a stripper written
 * against LF is silently inert on every CRLF file in this repo — which is most
 * of them, and is a defect this project has shipped before
 * (serverlessLifecycle.test.js records it).
 */
const stripComments = (src) => src
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

/**
 * Map each `const NAME = fs.readFileSync(path.join(__dirname, …))` to its file.
 *
 * Deliberately conservative: anything it cannot resolve is skipped rather than
 * guessed at. A wrong mapping would compare a literal against the wrong file
 * and report a defect that is not there, and a guard that cries wolf is a guard
 * somebody deletes.
 */
function textVars(src) {
  const map = new Map();
  const NAME = '([A-Za-z_][A-Za-z0-9_]*)';
  // `fs.readFileSync`, `readFileSync` and `require('fs').readFileSync` are all
  // in use; names are both SCREAMING_CASE and camelCase. The first version
  // accepted only the first of each and resolved ONE assertion out of ~50 — the
  // floor below is what said so, which is the entire reason it is there.
  const READ = "(?:fs\\.|require\\('fs'\\)\\.)?readFileSync";
  for (const m of src.matchAll(new RegExp(`const\\s+${NAME}\\s*=\\s*${READ}\\(\\s*path\\.join\\(__dirname,([\\s\\S]*?)\\)\\s*,`, 'g'))) {
    const parts = [...m[2].matchAll(/'([^']+)'/g)].map((p) => p[1]);
    if (!parts.length) continue;
    const p = path.join(TESTS, ...parts);
    if (fs.existsSync(p)) map.set(m[1], p);
  }
  // `require.resolve('../src/utils/x.js')` — the other shape in use.
  for (const m of src.matchAll(new RegExp(`const\\s+${NAME}\\s*=\\s*${READ}\\(\\s*require\\.resolve\\('([^']+)'\\)`, 'g'))) {
    const p = path.join(TESTS, m[2]);
    if (fs.existsSync(p)) map.set(m[1], p);
  }
  // Derived: `const X = stripComments(Y)` inherits Y's file and IS stripped.
  for (const m of src.matchAll(new RegExp(`const\\s+${NAME}\\s*=\\s*stripComments\\(\\s*${NAME}\\s*\\)`, 'g'))) {
    if (map.has(m[2])) map.set(m[1], map.get(m[2]));
  }
  return map;
}

/**
 * Positive `toContain('literal')` assertions whose subject derives from a known
 * text variable.
 *
 * NOT just `expect(VAR).toContain(...)`. The real defect was a SLICED subject —
 * §115 was `expect(block.split('};')[0]).toContain('providerCalls: 1')`, where
 * `block` came from the file text several lines earlier. Restricting this to a
 * bare variable found 3 assertions out of ~50 and would have missed the one
 * instance this whole file exists because of.
 *
 * So: find each `.toContain('lit')`, walk back to the `expect(` that opens it,
 * and attribute it to any text variable named inside that span.
 */
function literalAssertions(src, vars) {
  const out = [];
  const names = [...vars.keys()];

  /** The text variable this assertion's subject derives from, if any. */
  const subjectVar = (index) => {
    const before = src.slice(0, index);
    const at = before.lastIndexOf('expect(');
    if (at < 0) return null;
    const subject = before.slice(at);
    // `.not.` is the other direction: prose there causes a FALSE ALARM, which
    // is loud. This file is about the silent direction only.
    //
    // `\.not\b`, NOT `\.not\.` — the subject slice ends AT the `.toContain`, so
    // `expect(x).not.toContain(y)` arrives here as `expect(x).not` with no
    // trailing dot, and the dotted form matched nothing. That mis-flagged this
    // file's own canary in visionThrottle.test.js, which asserts a comment is
    // ABSENT from the stripped text.
    if (/\.not\b/.test(subject)) return null;
    return names.find((n) => new RegExp(`\\b${n}\\b`).test(subject)) || null;
  };

  for (const m of src.matchAll(/\.toContain\(\s*(['"])((?:\\.|(?!\1).){3,}?)\1\s*\)/g)) {
    const v = subjectVar(m.index);
    if (v) out.push({ v, kind: 'literal', lit: m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\') });
  }

  // REGEX ASSERTIONS ARE THE MAJORITY and were missed at first. Counting only
  // `toContain` resolved 3 assertions across 2 files; the source-reading tests
  // in this repo lean on `toMatch(/…/)` — 19 in one file alone — so a guard
  // ignoring them would have been mostly decorative.
  for (const m of src.matchAll(/\.toMatch\(\s*\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+)\/([gimsuy]*)\s*\)/g)) {
    const v = subjectVar(m.index);
    if (v) out.push({ v, kind: 'regex', body: m[1], flags: m[2].replace(/[gy]/g, '') });
  }
  return out;
}

// THE EXEMPTION, and it is a convention this repo already follows rather than
// one invented here.
//
// A test may legitimately assert that a COMMENT exists: both `visionThrottle`
// and `accountLifecycle` strip comments and then prove the stripper was not
// inert by requiring the un-stripped text to still contain one. That is the
// floor that stops a stripper matching nothing and reporting all clear — the
// same argument this file makes about itself.
//
// Both name the un-stripped variable `raw` / `EXTRACT_RAW`. So: an assertion on
// a variable whose name is or ends in `raw` is understood to be ABOUT the raw
// text, comments included, and is exempt. Anything else asserting on a comment
// is the defect.
const RAW_VAR = /(^|_)raw$/i;

const files = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.js') && f !== path.basename(__filename));

const checked = [];
const prose = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  if (!/readFileSync/.test(src)) continue;
  const vars = textVars(src);
  if (!vars.size) continue;
  for (const a of literalAssertions(src, vars)) {
    if (RAW_VAR.test(a.v)) continue;
    const target = vars.get(a.v);
    const raw = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const code = stripComments(raw);

    let inRaw; let inCode; let shown;
    if (a.kind === 'literal') {
      const needle = a.lit.replace(/\r\n/g, '\n');
      inRaw = raw.includes(needle);
      inCode = code.includes(needle);
      shown = `toContain(${JSON.stringify(a.lit).slice(0, 70)})`;
    } else {
      let re;
      // A regex this cannot construct is SKIPPED, not assumed innocent — but it
      // is also not counted toward the floor, so a wave of unparseable patterns
      // shows up as the derivation finding too little rather than as a pass.
      try { re = new RegExp(a.body, a.flags); } catch { continue; }
      inRaw = re.test(raw);
      inCode = re.test(code);
      shown = `toMatch(/${a.body.slice(0, 60)}/)`;
    }

    // An assertion whose needle is absent from the raw file is about something
    // else — a different variable, or text this mapping did not resolve.
    if (!inRaw) continue;
    checked.push({ f, v: a.v, target });
    if (!inCode) {
      prose.push(`${f}: expect(${a.v}).${shown} — satisfied ONLY by a comment in ${path.basename(target)}`);
    }
  }
}

describe('source-reading assertions are satisfied by code, not by comments', () => {
  it('found assertions to check at all', () => {
    // The floor. Without it, a broken derivation makes the check below pass by
    // having nothing to check — the vacuous pass this file exists to prevent,
    // reproduced inside it. guardCanaries.test.js makes the same argument about
    // every corpus scanner in the repo.
    expect(checked.length).toBeGreaterThanOrEqual(10);
  });

  it('spans more than one test file', () => {
    expect(new Set(checked.map((c) => c.f)).size).toBeGreaterThanOrEqual(3);
  });

  it('no assertion is satisfied only by prose', () => {
    expect(prose).toEqual([]);
  });

  it('POSITIVE CONTROL: it detects a planted comment-only needle', () => {
    // The canary. Runs the real predicate over a file whose only occurrence of
    // the needle is inside a comment, and requires it to be reported. Without
    // this, a stripper that matched nothing would leave every assertion above
    // reporting green — which is exactly how §115 shipped.
    const planted = '// the answer is bananaPhone42\nconst x = 1;\n';
    expect(planted.includes('bananaPhone42')).toBe(true);
    expect(stripComments(planted).includes('bananaPhone42')).toBe(false);
  });

  it('POSITIVE CONTROL: the stripper is not inert on CRLF', () => {
    // The other half, and the one that has actually bitten: a stripper written
    // against LF matches nothing on a CRLF file and reports all clear.
    const crlf = ['const x = 1; // bananaPhone42', 'const y = 2;'].join('\r\n');
    expect(crlf.includes('bananaPhone42')).toBe(true);
    expect(stripComments(crlf).includes('bananaPhone42')).toBe(false);
  });

  it('does NOT flag an assertion that the code genuinely satisfies', () => {
    // The negative control. A guard that flagged everything would also be
    // useless, and would be switched off faster than one that flags nothing.
    const real = '// providerCalls: 1 in the prose\nconst r = { providerCalls: 1 };\n';
    expect(stripComments(real).includes('providerCalls: 1')).toBe(true);
  });
});
