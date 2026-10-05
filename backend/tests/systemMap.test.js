// docs/SYSTEM_MAP.md is GENERATED. This keeps it honest.
//
// Two different jobs here, and the second is the one that matters.
//
// FRESHNESS — the committed file must be what the generator produces now, the
// same guard shared/facts.js carries. A stale map is worse than no map: you
// trust it, and it lies about the one row you did not check.
//
// COVERAGE — the generator PARSES source, and a parser that quietly matches
// less than it should produces a document that looks complete and is not. That
// is not hypothetical: the first version's middleware pattern could not span
// `rbac('medical', 'admin')`, so it found 15 of 59 endpoints and rendered a
// perfectly plausible table of them. Nothing about the output said so.
//
// So each section is checked against an INDEPENDENT count of the thing it is
// supposed to describe.
const fs = require('fs');
const path = require('path');

const gen = require('../scripts/system-map');

const BE = path.join(__dirname, '..');
const ROOT = path.join(BE, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const walk = (dir, test, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
};

const md = () => read(gen.OUT);

describe('the system map is in sync', () => {
  it('the committed file is what the generator produces', () => {
    // If this fails: run `cd backend; npm run map`.
    expect(read(gen.OUT)).toBe(gen.render());
  });

  // THE CANARY (2026-09-10, guardCanaries.test.js). The staleness check above
  // compares the committed file to `render()`. If `render()` ever produced a
  // constant, or the comparison were loosened, it would report "current" for
  // ever — which is the §56.3 failure exactly: the first route parser found 15
  // of 59 endpoints and rendered a table that looked entirely plausible.
  //
  // So: a document that differs by ONE character must be rejected. This is the
  // comparison the suite actually makes, run against a planted difference.
  it('can detect a stale document — the planted case it exists to find', () => {
    const real = gen.render();
    const tampered = `${real}\ntrailing drift\n`;
    expect(real === tampered).toBe(false);

    // And a subtler one: a single changed digit inside a count must not pass.
    const digit = real.replace(/\*\*(\d+) models\*\*/, (_m, n) => `**${Number(n) + 1} models**`);
    expect(digit).not.toBe(real); // the substitution really applied
    expect(real === digit).toBe(false);
  });

  it('is idempotent — a second run changes nothing', () => {
    expect(gen.render()).toBe(gen.render());
  });

  it('needs no database, so it runs on a clean clone', () => {
    // render() introspects the models rather than querying them. If somebody
    // adds a findAll() to the generator this stops being true and the script
    // starts failing in CI for reasons nobody will connect to this file.
    const src = read(path.join(BE, 'scripts', 'system-map.js'));
    expect(src).not.toMatch(/\.(findAll|findOne|findByPk|count|query)\s*\(/);
  });
});

describe('the map actually covers what it claims to', () => {
  it('lists EVERY route the routers define', () => {
    // Independent count: every `router.<verb>(` in every mounted route file.
    // This is the assertion that would have caught 15-of-59.
    const files = walk(path.join(BE, 'src', 'routes'), (n) => n.endsWith('.js'));
    const defined = files
      .map((f) => (read(f).match(/router\.(get|post|put|patch|delete)\(/g) || []).length)
      .reduce((a, b) => a + b, 0);
    const listed = Number(md().match(/\*\*(\d+) endpoints\*\*/)[1]);
    expect({ listed, defined }).toEqual({ listed: defined, defined });
    expect(defined).toBeGreaterThan(40);
  });

  it('lists every model, and every column of each', () => {
    const m = require('../src/models');
    const names = Object.keys(m).filter((k) => m[k] && m[k].rawAttributes);
    const cols = names.reduce((n, k) => n + Object.keys(m[k].rawAttributes).length, 0);
    const doc = md();
    expect(Number(doc.match(/\*\*(\d+) models\*\*/)[1])).toBe(names.length);
    expect(Number(doc.match(/\*\*(\d+) columns\*\*/)[1])).toBe(cols);
    // and each model has its own section, not just a count
    for (const n of names) expect(doc).toContain(`### ${n} —`);
  });

  it('lists every page', () => {
    const found = walk(path.join(ROOT, 'frontend', 'src', 'app'), (n) => n === 'page.tsx').length;
    expect(Number(md().match(/\*\*(\d+) pages\*\*/)[1])).toBe(found);
    expect(found).toBeGreaterThan(15);
  });

  it('resolves the roles rather than printing a placeholder', () => {
    // A route whose rbac list failed to parse would render an empty Roles cell
    // and read as "no restriction". Every row must name something.
    const section = md().split('## 2. API endpoints')[1].split('## 3.')[0];
    const rows = section.split('\n').filter((l) => l.startsWith('| GET |') || l.startsWith('| POST |')
      || l.startsWith('| PATCH |') || l.startsWith('| DELETE |') || l.startsWith('| PUT |'));
    expect(rows.length).toBeGreaterThan(40);
    for (const r of rows) {
      const roles = r.split('|')[3].trim();
      expect({ row: r.slice(0, 60), roles: roles.length > 0 }).toEqual({ row: r.slice(0, 60), roles: true });
    }
  });

  it('names the enum values on the columns that have them', () => {
    // The single most useful thing in the map for maintenance, and the thing a
    // naive type dump loses. If these stop appearing the introspection has
    // regressed to printing "ENUM" with no values.
    // The pipes are backslash-escaped, because an unescaped one inside a table
    // cell splits the row and silently mangles the table. Asserted in the
    // escaped form on purpose: matching the bare form would fail against a
    // CORRECT document and pass against a broken one.
    const doc = md();
    for (const v of ['PODIUM \\| PELAPIS \\| OTHERS', 'green \\| amber \\| red', 'Male \\| Female']) {
      expect(doc).toContain(v);
    }
    // ...and the escaping must not have eaten the ENUM marker itself.
    expect(doc).toMatch(/ENUM\(PODIUM/);
  });

  it('carries the settings, audit actions, shared facts, env vars and scripts', () => {
    const doc = md();
    for (const heading of ['## 4. Institution settings', '## 5. Audited actions',
      '## 6. Shared facts', '## 7. Environment variables', '## 8. npm scripts']) {
      expect(doc).toContain(heading);
    }
    // Spot-check one real value per section, so an empty section cannot pass.
    expect(doc).toContain('rescreen_due_days');
    expect(doc).toContain('screening.import');
    expect(doc).toContain('INSTITUTION_TZ');
    expect(doc).toContain('MYSQL_HOST');
    expect(doc).toContain('measure:facts');
  });
});

// ── the re-export resolver, against a fixture (2026-10-05, §123) ────────────
//
// WHY A FIXTURE AND NOT THE APP. This was covered only INDIRECTLY, by the app
// happening to contain a page that re-exports another — `medical/cohort-norms`
// was `export { default } from '../../admin/thresholds/page'`. §123 deleted that
// page, and `npm run mutate` immediately reported the guard as SURVIVED:
// breaking `resolveReExport` changed no output, because nothing exercised it.
//
// That is a guard retiring itself silently, which is worse than a guard that was
// never written — the registry still listed it, so the run still counted it.
// The resolver is live code and the next shared page will be written the same
// way, so the test now owns its own subject.
describe('resolveReExport', () => {
  const fs2 = require('fs');
  const os = require('os');
  const path2 = require('path');
  const { resolveReExport } = require('../scripts/system-map');

  let dir;
  beforeEach(() => { dir = fs2.mkdtempSync(path2.join(os.tmpdir(), 'reexport-')); });
  afterEach(() => { fs2.rmSync(dir, { recursive: true, force: true }); });

  const write = (rel, body) => {
    const full = path2.join(dir, rel);
    fs2.mkdirSync(path2.dirname(full), { recursive: true });
    fs2.writeFileSync(full, body);
    return full;
  };

  it('follows the re-export and returns the TARGET source', () => {
    write('real/page.tsx', "<DashboardLayout allowedRoles={['admin', 'medical']} title=\"Real\" />");
    const alias = write('alias/page.tsx', "export { default } from '../real/page';\n");
    const out = resolveReExport(alias, fs2.readFileSync(alias, 'utf8'));
    expect(out).toContain("allowedRoles={['admin', 'medical']}");
  });

  it('leaves an ordinary page alone', () => {
    const own = write('own/page.tsx', "<DashboardLayout allowedRoles={['coach']} title=\"Own\" />");
    const src = fs2.readFileSync(own, 'utf8');
    expect(resolveReExport(own, src)).toBe(src);
  });

  it('returns the ORIGINAL source when the target does not exist', () => {
    // Not an empty string and not a throw: the map must still render a row, and
    // the row will say `public` — visibly odd rather than confidently wrong,
    // which is the trade this resolver's own comment records.
    const broken = write('broken/page.tsx', "export { default } from '../missing/page';\n");
    const src = fs2.readFileSync(broken, 'utf8');
    expect(resolveReExport(broken, src)).toBe(src);
  });

  it('is what makes a re-exporting page report its ROLES rather than public', () => {
    // The property the map actually depends on, stated as the map states it:
    // without the resolver the alias has no allowedRoles of its own, and the
    // page parser falls through to 'public' — publishing a gated page as
    // reachable by anybody, in the document people read to answer that question.
    const alias = write('alias2/page.tsx', "export { default } from '../real2/page';\n");
    write('real2/page.tsx', "<DashboardLayout allowedRoles={['admin']} title=\"R\" />");
    const resolved = resolveReExport(alias, fs2.readFileSync(alias, 'utf8'));
    const raw = fs2.readFileSync(alias, 'utf8');
    expect(resolved.match(/allowedRoles=\{\[([^\]]*)\]\}/)).not.toBeNull();
    expect(raw.match(/allowedRoles=\{\[([^\]]*)\]\}/)).toBeNull();
  });
});

// AND THE RESOLVER IS ACTUALLY WIRED INTO pages() (2026-10-05).
//
// The four cases above call `resolveReExport` directly, and `npm run mutate`
// showed that is not enough: un-wiring the CALL SITE — `resolveReExport(file,
// read(file))` back to `read(file)` — left every one of them green. A pure
// function is correct whether or not anybody calls it, which is `winAnsiSafe`
// exactly: defined, exported, unit-tested and never invoked.
//
// Normally the fix is to assert on the OUTPUT, and here that is impossible by
// construction: the output only differs for a re-exporting page, and since §123
// the app has none. So this reads the source, the same technique
// authThrottle.test.js uses on routes/auth.js for the same reason — the thing
// being guarded is a wiring fact with no observable consequence today.
//
// Deliberately asserted against a COMMENT-STRIPPED copy, or this file's own
// prose about `resolveReExport(file, read(file))` would satisfy it (§118).
it('pages() resolves re-exports rather than reading the file raw', () => {
  const fs2 = require('fs');
  const path2 = require('path');
  const raw = fs2.readFileSync(path2.join(__dirname, '..', 'scripts', 'system-map.js'), 'utf8');
  const code = raw
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  expect(code).toContain('resolveReExport(file, read(file))');
  // The positive control: the stripper must not have eaten the whole file, or
  // the assertion above would be checking an empty string.
  expect(code).toContain('function pages()');
  expect(code.length).toBeGreaterThan(2000);
});
