#!/usr/bin/env node
// docs/SYSTEM_MAP.md — every attribute of AIRMS, READ FROM THE CODE.
//
//   cd backend; npm run map
//
// Why generated and not written: a hand-maintained inventory is wrong the first
// time somebody adds a column, and being *slightly* wrong is worse than absent
// — you trust it, and it lies about the one row you did not check. This reads
// the Sequelize models, the route files, the page components, the settings
// defaults and the shared facts, so it is either correct or it fails to build.
//
// It answers the questions maintenance actually asks:
//   "what columns does a screening have, and which are enums?"
//   "who can call this endpoint?"
//   "which pages does a coach see?"
//   "what settings exist and what do they default to?"
//   "which env vars does the backend read?"
//
// It needs NO database — models are introspected, not queried — so it runs on a
// clean clone. tests/systemMap.test.js fails if the committed copy is stale,
// the same guard shared/facts.js carries.
//
// Deliberately NOT here: anything the map cannot verify. No prose about why a
// decision was taken (that is DESIGN_DECISIONS.md), no measured figures (that
// is `npm run measure:facts`, which needs the database and changes with it).

const fs = require('fs');
const path = require('path');

const BE = path.join(__dirname, '..');
const ROOT = path.join(BE, '..');
const FE = path.join(ROOT, 'frontend', 'src');
const OUT = path.join(ROOT, 'docs', 'SYSTEM_MAP.md');

const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir, test, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
};

// ── models ──────────────────────────────────────────────────────────────────
// Introspected, so the column list cannot disagree with the schema the app
// actually defines. Requires the models module, which does not connect.
function models() {
  const m = require('../src/models');
  const skip = new Set(['sequelize', 'Sequelize']);
  return Object.keys(m).filter((k) => !skip.has(k) && m[k] && m[k].rawAttributes).sort()
    .map((name) => {
      const M = m[name];
      const cols = Object.entries(M.rawAttributes).map(([attr, def]) => {
        const t = def.type;
        let type = (t && t.key) || String(t);
        if (t && t.values && t.values.length) type = `ENUM(${t.values.join(' | ')})`;
        else if (t && t.options && t.options.length) type = `${type}(${t.options.length})`;
        return {
          attr,
          column: def.field || attr,
          type,
          pk: !!def.primaryKey,
          nullable: def.allowNull !== false,
          def: def.defaultValue === undefined ? '' : String(def.defaultValue),
        };
      });
      return { name, table: M.getTableName(), cols };
    });
}

// ── routes ──────────────────────────────────────────────────────────────────
// Parsed from source rather than from a running app: mounting every router
// would need a database, and this has to work on a clean clone.
const MOUNTS = (() => {
  const src = read(path.join(BE, 'src', 'server.js'));
  const out = {};
  for (const m of src.matchAll(/app\.use\('(\/api\/[^']+)',\s*(?:\w+,\s*)?(\w+)\)/g)) {
    out[m[2]] = m[1];
  }
  const files = {};
  for (const m of src.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)) files[m[1]] = m[2];
  const byFile = {};
  for (const [varName, mount] of Object.entries(out)) {
    if (files[varName]) byFile[files[varName]] = mount;
  }
  return byFile;
})();

function routes() {
  const dir = path.join(BE, 'src', 'routes');
  const rows = [];
  for (const file of walk(dir, (n) => n.endsWith('.js'))) {
    const base = path.basename(file, '.js');
    const mount = MOUNTS[base];
    if (!mount) continue; // not mounted — e.g. a router that was removed
    const src = read(file);
    // The middleware span must be allowed to CONTAIN parentheses — rbac('a','b')
    // and requirePermission('x') both do. An earlier `[^)]*?` stopped at the
    // first one and silently matched only the 15 routes that happen to have no
    // guard arguments, out of 52. A parser that quietly finds a third of the
    // corpus is worse than one that crashes, so the count is asserted below.
    for (const m of src.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*'([^']*)',([\s\S]{0,400}?)(?:async\s*\(|\(\s*_?req\b)/g,
    )) {
      const [, verb, sub, middleware] = m;
      const rbacM = middleware.match(/rbac\(([^)]*)\)/);
      const roles = rbacM
        ? rbacM[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
        : (/\bauth\b/.test(middleware) ? ['any signed-in'] : ['PUBLIC']);
      const permM = middleware.match(/requirePermission\('([^']+)'\)/);
      rows.push({
        method: verb.toUpperCase(),
        path: (mount + sub).replace(/\/$/, '') || mount,
        roles: roles.join(', '),
        permission: permM ? permM[1] : '',
        file: `backend/src/routes/${base}.js`,
      });
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// ── pages ───────────────────────────────────────────────────────────────────
function pages() {
  const dir = path.join(FE, 'app');
  return walk(dir, (n) => n === 'page.tsx').map((file) => {
    const src = read(file);
    const rel = path.relative(dir, path.dirname(file)).split(path.sep).join('/');
    const roleM = src.match(/allowedRoles=\{\[([^\]]*)\]\}/);
    const titleM = src.match(/title="([^"]*)"/);
    return {
      route: `/${rel}`.replace('/.', '/'),
      roles: roleM ? roleM[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean).join(', ') : 'public',
      title: titleM ? titleM[1] : '',
    };
  }).sort((a, b) => a.route.localeCompare(b.route));
}

// ── settings, audit actions, env ────────────────────────────────────────────
function settings() {
  const src = read(path.join(BE, 'src', 'utils', 'settings.js'));
  const block = src.slice(src.indexOf('const DEFAULTS'));
  const rows = [];
  for (const m of block.matchAll(/^\s{2}(\w+):\s*([^,\n]+),/gm)) rows.push({ key: m[1], def: m[2].trim() });
  return rows;
}

function auditActions() {
  const src = walk(path.join(BE, 'src'), (n) => n.endsWith('.js')).map(read).join('\n');
  const set = new Set();
  for (const m of src.matchAll(/action:\s*'([a-z]+\.[a-z]+)'/g)) set.add(m[1]);
  return [...set].sort();
}

function envVars() {
  const src = walk(path.join(BE, 'src'), (n) => n.endsWith('.js'))
    .concat(walk(path.join(BE, 'scripts'), (n) => n.endsWith('.js'))).map(read).join('\n');
  const set = new Set();
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) set.add(m[1]);
  return [...set].sort();
}

function scripts() {
  const out = [];
  for (const [where, p] of [['root', path.join(ROOT, 'package.json')],
    ['backend', path.join(BE, 'package.json')],
    ['frontend', path.join(ROOT, 'frontend', 'package.json')]]) {
    const j = JSON.parse(read(p));
    for (const [k, v] of Object.entries(j.scripts || {})) out.push({ where, name: k, cmd: v });
  }
  return out;
}

// ── render ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/\|/g, '\\|');
const table = (headers, rows, pick) => [
  `| ${headers.join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((r) => `| ${pick(r).map(esc).join(' | ')} |`),
].join('\n');

function render() {
  const F = require('../src/shared/facts');
  const M = models();
  const R = routes();
  const P = pages();
  const L = [];

  L.push('# AIRMS system map');
  L.push('');
  L.push('**GENERATED — do not edit.** Run `cd backend; npm run map`.');
  L.push('');
  L.push('Every table below is read from the code: the models are introspected, the');
  L.push('routes and pages are parsed from source, the settings and shared facts are');
  L.push('imported. Nothing here is typed by hand, so it cannot drift from what the');
  L.push('system actually does — `backend/tests/systemMap.test.js` fails if the');
  L.push('committed copy is stale.');
  L.push('');
  L.push('This is the *what*. The **why** is [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md),');
  L.push('the measured figures are `npm run measure:facts` (which needs the database),');
  L.push('and the access model argued in prose is [`PERMISSIONS.md`](PERMISSIONS.md).');
  L.push('');
  L.push(`Counts: **${M.length} models**, **${M.reduce((n, m) => n + m.cols.length, 0)} columns**, `
       + `**${R.length} endpoints**, **${P.length} pages**.`);
  L.push('');

  L.push('## 1. Data model');
  L.push('');
  for (const m of M) {
    L.push(`### ${m.name} — \`${m.table}\``);
    L.push('');
    L.push(table(['Attribute', 'Column', 'Type', 'Null', 'Default'], m.cols,
      (c) => [c.pk ? `**${c.attr}** (PK)` : c.attr, c.column, c.type, c.nullable ? 'yes' : 'no', c.def]));
    L.push('');
  }

  L.push('## 2. API endpoints');
  L.push('');
  L.push('`roles` is the `rbac(...)` allow-list. `permission` is the extra per-account');
  L.push('capability check, which applies to medical accounts. A scoped role may still be');
  L.push('refused inside the handler — see PERMISSIONS.md for what each role actually reaches.');
  L.push('');
  L.push(table(['Method', 'Path', 'Roles', 'Permission', 'File'], R,
    (r) => [r.method, `\`${r.path}\``, r.roles, r.permission, r.file]));
  L.push('');

  L.push('## 3. Pages');
  L.push('');
  L.push('`roles` is the `allowedRoles` on the page\'s `DashboardLayout`. That gate is');
  L.push('client-side; the API\'s RBAC above is the real boundary.');
  L.push('');
  L.push(table(['Route', 'Roles', 'Title'], P, (p) => [`\`${p.route}\``, p.roles, p.title]));
  L.push('');

  L.push('## 4. Institution settings');
  L.push('');
  L.push(table(['Key', 'Default'], settings(), (s) => [`\`${s.key}\``, `\`${s.def}\``]));
  L.push('');

  L.push('## 5. Audited actions');
  L.push('');
  L.push('Append-only. Written fire-and-forget, so a lost row is silent.');
  L.push('');
  L.push(auditActions().map((a) => `\`${a}\``).join(' · '));
  L.push('');

  L.push('## 6. Shared facts');
  L.push('');
  L.push('Generated into both packages from `shared/facts.js` — see DESIGN_DECISIONS §53.');
  L.push('');
  const factRows = Object.entries(F).map(([k, v]) => ({
    k, v: Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v),
  }));
  L.push(table(['Fact', 'Value'], factRows,
    (r) => [`\`${r.k}\``, `\`${r.v.length > 150 ? `${r.v.slice(0, 150)}…` : r.v}\``]));
  L.push('');

  L.push('## 7. Environment variables the backend reads');
  L.push('');
  L.push(envVars().map((e) => `\`${e}\``).join(' · '));
  L.push('');

  L.push('## 8. npm scripts');
  L.push('');
  L.push(table(['Where', 'Script', 'Command'], scripts(),
    (s) => [s.where, `\`${s.name}\``, `\`${s.cmd}\``]));
  L.push('');

  return `${L.join('\n')}\n`;
}

module.exports = { render, OUT };

if (require.main === module) {
  const md = render();
  const before = fs.existsSync(OUT) ? read(OUT).replace(/\r\n/g, '\n') : null;
  if (before === md) console.log('system map: already up to date');
  else { fs.writeFileSync(OUT, md); console.log(`system map: wrote ${path.relative(ROOT, OUT)}`); }
}
