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
