// Every destructured require names something the target actually exports.
//
// WHY THIS EXISTS. The §56 sweep moved `median` out of `screeningPeriods.js`
// into `utils/num.js`. Fourteen call sites were updated; `scripts/measure-facts.js`
// was not, and kept `const { median } = require('../src/utils/screeningPeriods')`.
//
// That line is not a resolution error. The module resolves, the destructure
// binds `undefined`, and nothing complains until something CALLS it — at which
// point `npm run measure:facts` dies with "median is not a function", which
// names neither the moved function nor the file that lost it.
//
// It survived 565 passing tests for a fortnight because:
//   - `node --check` only checks SYNTAX; a dangling named import is valid syntax
//   - a `require()` smoke test would have loaded the module fine
//   - nothing under scripts/ is covered by any suite
//
// And the script it broke is the one whose entire job is to stop stale numbers
// being quoted in the viva (SILENT_FAILURES H7). The guard was absent from
// exactly the tool that guards everything else.
//
// HOW IT CHECKS. Statically, by reading both files as text. It deliberately
// does NOT `require()` the target: several modules here build a Sequelize
// instance at import time, seeder.js used to reseed the database on import
// (CLAUDE.md), and a test that executes arbitrary modules to inspect them is a
// worse hazard than the one it detects.
//
// Modules whose export shape cannot be read statically (a spread, a bare
// function, a computed key) are SKIPPED rather than guessed at — and the count
// of pairs actually checked is asserted against a floor, so a parser change
// that quietly stops matching anything fails instead of passing vacuously.
// That is the systemMap lesson: the first route parser found 15 of 59 endpoints
// and rendered a plausible table (DD 56.3).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, 'scripts')];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(full, acc);
    } else if (e.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * The names a module exports, or null when the shape is not statically readable.
 *
 * Returns null (rather than an empty set) for anything it cannot read, because
 * an empty set would make every import of that module look broken — a check
 * that cries wolf is a check that gets deleted.
 */
function exportedNames(file) {
  const src = decomment(fs.readFileSync(file, 'utf8'));
  const names = new Set();

  // module.exports.foo = ... / exports.foo = ...
  for (const m of src.matchAll(/(?:^|\n)\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(m[1]);
  }

  const assign = src.match(/(?:^|\n)\s*module\.exports\s*=\s*([\s\S]*)$/);
  if (!assign) return names.size ? names : null;

  const rest = assign[1].trimStart();
  if (!rest.startsWith('{')) return names.size ? names : null; // a function, a class, a re-export

  // Balance braces to find the end of the object literal.
  let depth = 0; let end = -1;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '{') depth += 1;
    else if (rest[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  const body = rest.slice(1, end);

  // A spread means the real export list lives somewhere else — unreadable here.
  if (/\.\.\./.test(body)) return null;
  // A computed key, likewise.
  if (/^\s*\[/m.test(body)) return null;

  for (const part of body.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
    if (m) names.add(m[1]);
    else return null; // something this parser does not understand
  }
  return names;
}

/** Every `const { a, b: c } = require('<relative>')` in a file. */
function destructuredRequires(file) {
  const src = decomment(fs.readFileSync(file, 'utf8'));
  const out = [];
  const re = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"](\.[^'"]*)['"]\s*\)/g;
  for (const m of src.matchAll(re)) {
    const keys = m[1].split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.split(':')[0].trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    if (keys.length) out.push({ spec: m[2], keys });
  }
  return out;
}

function resolveTarget(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

describe('destructured requires name real exports', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it('scans a plausible number of files', () => {
    // A floor, so a broken walk cannot pass by finding nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  const checked = [];
  const broken = [];
  const skipped = [];

  for (const file of files) {
    for (const { spec, keys } of destructuredRequires(file)) {
      const target = resolveTarget(file, spec);
      if (!target) { skipped.push(`${path.relative(ROOT, file)} -> ${spec} (unresolved)`); continue; }
      const exports_ = exportedNames(target);
      if (!exports_) { skipped.push(`${path.relative(ROOT, file)} -> ${spec} (shape unreadable)`); continue; }
      for (const k of keys) {
        checked.push(k);
        if (!exports_.has(k)) {
          broken.push(`${path.relative(ROOT, file)} imports { ${k} } from '${spec}', which does not export it`);
        }
      }
    }
  }

  it('checks a plausible number of imported names', () => {
    // The real figure at the time of writing is ~200. A parser that stops
    // matching would otherwise report "no broken imports" and be believed.
    expect(checked.length).toBeGreaterThan(100);
  });

  it('finds no import of a name the target does not export', () => {
    // If this fails, the named function was probably MOVED. Follow it to its new
    // home and update the import — do not re-export it from the old module to
    // silence this, which would recreate the second definition the move removed.
    expect(broken).toEqual([]);
  });

  it('reports what it could not check, so the skips stay visible', () => {
    // Not an assertion about the contents — a printed list, so that a growing
    // pile of unreadable modules is noticed rather than silently tolerated.
    if (skipped.length) {
      // eslint-disable-next-line no-console
      console.log(`  (scriptImports: ${skipped.length} pair(s) not statically checkable)`);
    }
    expect(skipped.length).toBeLessThan(60);
  });
});
