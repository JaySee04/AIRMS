#!/usr/bin/env node
/**
 * Use-case diagrams for Chapter 4, GENERATED from Table 4.1.
 *
 *   node docs/fyp/uc-diagrams/generate.js
 *
 * WHY THIS IS A GENERATOR. The two hand-drawn diagrams in docs/fyp/ are
 * absolutely-positioned SVG, and they drifted: uc-general stopped at UC-50 and
 * uc-datamgmt at UC-56 while Table 4.1 grew to UC-73. Seventeen use cases
 * appeared in no figure at all, so Chapter 4 cited figures that contradicted
 * its own table. Hand-placing five more would reproduce the fault with a longer
 * fuse.
 *
 * Reading the table means the figures CANNOT disagree with it, and since the
 * table itself was corrected against the build on 2026-10-11 there is nothing
 * left for the CORRECTIONS overlay to carry — it is deliberately empty.
 *
 * Output: one self-contained HTML per module, for screenshotting into the
 * report. No dependencies, no build step.
 */

const fs = require('fs');
const path = require('path');

const TABLE = path.join(__dirname, '..', 'REPORT_TABLE_4-1.md');
const OUT_DIR = __dirname;

/** Where Table 4.1 and the delivered system disagree, with the reason. */
const CORRECTIONS = {
  // EMPTY, AND THAT IS THE POINT. This held eight entries on 2026-10-10 because
  // Table 4.1 described a deleted feature (UC-63), named two escalation rules
  // where there are three, omitted the executive role, and granted medical
  // staff an import that is admin-only. Those rows were corrected IN THE TABLE
  // on 2026-10-11, so the overlay has nothing left to do.
  //
  // Add an entry here only to carry a divergence the table has not yet caught
  // up with, and remove it the moment the table does. An overlay that outlives
  // its reason becomes a second, quieter source of truth.
};

/** Built since the last diagram revision (2026-09-02, which reached UC-56). */
const NEW_FROM = 57;

/** Use cases with no row in Table 4.1 yet. §4.1.1 proposes them. */
const ADDITIONS = [
  // Use cases with no row in Table 4.1. Empty since UC-73 was added to the
  // table on 2026-10-11 — the table is the single source again.
];

// ── Table 4.1 ────────────────────────────────────────────────────────────────

function parseTable() {
  const src = fs.readFileSync(TABLE, 'utf8');
  const start = src.indexOf('## Table 4.1');
  if (start < 0) throw new Error('Table 4.1 heading not found');
  let body = src.slice(start);
  const end = body.indexOf('\n## ', 10);
  if (end > 0) body = body.slice(0, end);

  const rows = [];
  let module = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 5 || !/^UC-\d+$/.test(cells[1])) continue;
    if (cells[0]) module = cells[0].replace(/\*\*/g, '').trim();
    rows.push({ module, uc: cells[1], title: cells[2], roles: cells[4] });
  }
  if (!rows.length) throw new Error('Table 4.1 parsed to zero rows — the format changed');
  return rows;
}

// ── Roles → actors ───────────────────────────────────────────────────────────

// Drawn left-to-right in this order. Administrator and System sit on the right
// because that is where the two existing hand-drawn figures put them, and a
// reader comparing old and new screenshots should not have to relearn the page.
const ACTOR_ORDER = ['Athlete', 'Coach', 'Medical Staff', 'Administrator', 'Executive', 'System'];
const RIGHT_SIDE = new Set(['Administrator', 'Executive', 'System']);

function actorsOf(roleText) {
  const found = [];
  for (const part of roleText.split(',')) {
    // "Coach (assigned sport only)" and "Athlete (own report only)" are scope
    // notes on the association, not separate actors.
    const name = part.replace(/\([^)]*\)/g, '').trim();
    const hit = ACTOR_ORDER.find((a) => a.toLowerCase() === name.toLowerCase());
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}

// ── Layout ───────────────────────────────────────────────────────────────────

const W = 1140;
const BOX_X = 330;
const BOX_W = 480;
const CX = BOX_X + BOX_W / 2;
const RX = 150;
const RY = 25;
const PITCH = 60;
const TOP = 96;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Greedy wrap to at most `max` lines; the last line absorbs any overflow. */
function wrap(text, width, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= width || lines.length === max - 1) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, max);
}

function stickFigure(x, y, label, anchor) {
  const lines = wrap(label, 14, 2);
  // paint-order puts the white stroke UNDER the glyphs, so the label stays
  // readable where association lines pass behind it. Without it, "Athlete" on
  // the Module 1 figure sits under six converging lines.
  const text = lines
    .map((l, i) => `<text x="${x}" y="${y + 52 + i * 13}" text-anchor="middle" font-size="11.5" font-weight="bold" paint-order="stroke" stroke="#fff" stroke-width="3.5" stroke-linejoin="round">${esc(l)}</text>`)
    .join('');
  return `<g stroke="#444" stroke-width="1.5" fill="none">
      <circle cx="${x}" cy="${y - 20}" r="9" fill="#fff"/>
      <line x1="${x}" y1="${y - 11}" x2="${x}" y2="${y + 16}"/>
      <line x1="${x - 14}" y1="${y - 2}" x2="${x + 14}" y2="${y - 2}"/>
      <line x1="${x}" y1="${y + 16}" x2="${x - 12}" y2="${y + 38}"/>
      <line x1="${x}" y1="${y + 16}" x2="${x + 12}" y2="${y + 38}"/>
    </g>${text}<!-- anchor:${anchor} -->`;
}

function render(moduleName, rows, applied) {
  const actors = [];
  for (const r of rows) for (const a of actorsOf(r.roles)) if (!actors.includes(a)) actors.push(a);
  actors.sort((a, b) => ACTOR_ORDER.indexOf(a) - ACTOR_ORDER.indexOf(b));

  const left = actors.filter((a) => !RIGHT_SIDE.has(a));
  const right = actors.filter((a) => RIGHT_SIDE.has(a));

  const boxH = TOP + rows.length * PITCH + 24;
  const H = Math.max(boxH + 70, 300);

  // Actors spread down their own side, inside the boundary's vertical span.
  const place = (list, x) => {
    const span = boxH - 120;
    return list.map((name, i) => ({
      name,
      x,
      y: 110 + (list.length === 1 ? span / 2 : (span / (list.length - 1)) * i),
    }));
  };
  const placed = [...place(left, 118), ...place(right, W - 118)];
  const byName = Object.fromEntries(placed.map((p) => [p.name, p]));

  const ucY = (i) => TOP + 34 + i * PITCH;

  // Associations first, so ellipses paint over the line ends.
  const lines = [];
  for (const p of placed) {
    const mine = rows.map((r, i) => ({ r, i })).filter(({ r }) => actorsOf(r.roles).includes(p.name));
    mine.forEach(({ i }, n) => {
      // Fan the origins so N lines do not converge on one pixel.
      const y0 = p.y + (n - (mine.length - 1) / 2) * 7;
      const onLeft = !RIGHT_SIDE.has(p.name);
      const x0 = onLeft ? p.x + 20 : p.x - 20;
      const x1 = onLeft ? CX - RX : CX + RX;
      lines.push(`<line x1="${x0}" y1="${y0.toFixed(1)}" x2="${x1}" y2="${ucY(i)}"/>`);
    });
  }

  const ellipses = rows
    .map((r, i) => {
      const y = ucY(i);
      const isNew = Number(r.uc.slice(3)) >= NEW_FROM;
      const fill = isNew ? '#d5e8d4' : '#fff';
      const stroke = isNew ? '#82b366' : '#6c8ebf';
      const label = wrap(r.title, 26, 2);
      const t = label
        .map((l, k) => `<text x="${CX}" y="${y + (label.length === 1 ? 1 : -5 + k * 13)}" text-anchor="middle" font-size="11.5">${esc(l)}</text>`)
        .join('');
      return `<ellipse cx="${CX}" cy="${y}" rx="${RX}" ry="${RY}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
      <text x="${CX - RX + 8}" y="${y - RY + 2}" font-size="9" fill="#777">${esc(r.uc)}</text>${t}`;
    })
    .join('\n    ');

  const footNote = applied.length
    ? `<div class="foot"><b>Corrected against the delivered system</b> (Table 4.1 still states the
       superseded version — see the report’s §4.1.1 correction schedule):<ul>${applied
      .map((c) => `<li><b>${esc(c.uc)}</b> — ${esc(c.why)}</li>`)
      .join('')}</ul></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AIRMS — Use Case Diagram: ${esc(moduleName)}</title>
<!--
  GENERATED by docs/fyp/uc-diagrams/generate.js from Table 4.1
  (docs/fyp/REPORT_TABLE_4-1.md). Do not hand-edit: re-run the generator.
  Green = built since the 2026-09-02 diagram revision, which reached UC-56.
-->
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #1a1a1a;
    font-family: Helvetica, Arial, sans-serif; }
  .page { width: ${W}px; margin: 16px auto; }
  h1 { margin: 0 0 4px; font-size: 17px; font-weight: 700; text-align: center; letter-spacing: .3px; }
  .legend { margin: 0 0 10px; text-align: center; font-size: 11px; color: #555; }
  .legend .swatch { display: inline-block; width: 10px; height: 10px; border: 1px solid #82b366;
    background: #d5e8d4; vertical-align: -1px; margin: 0 4px 0 10px; }
  .foot { width: ${W - 40}px; margin: 10px auto 0; font-size: 10.5px; color: #555; line-height: 1.5; }
  .foot ul { margin: 4px 0 0; padding-left: 18px; }
</style>
</head>
<body>
<div class="page">
  <h1>Use Case Diagram — ${esc(moduleName)}</h1>
  <div class="legend">${rows.length} use cases${
    rows.some((r) => Number(r.uc.slice(3)) >= NEW_FROM)
      ? '\n    <span class="swatch"></span> built since the previous diagram revision'
      : ''
  }</div>

  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
    <rect x="${BOX_X}" y="60" width="${BOX_W}" height="${boxH - 60}" fill="#fff" stroke="#6c8ebf" stroke-width="1.4"/>
    <text x="${CX}" y="82" text-anchor="middle" font-size="13" font-weight="bold">AIRMS — ${esc(moduleName)}</text>

    <g stroke="#444" stroke-width="1.1" opacity=".85">
      ${lines.join('\n      ')}
    </g>

    ${ellipses}

    ${placed.map((p) => stickFigure(p.x, p.y, p.name, p.name)).join('\n    ')}
  </svg>
  ${footNote}
</div>
</body>
</html>
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function slug(moduleName) {
  const m = moduleName.match(/Module\s+(\d+)/);
  if (m) return `module-${m[1]}`;
  return 'general';
}

function main() {
  const rows = parseTable();
  const appliedAll = [];

  for (const r of rows) {
    const c = CORRECTIONS[r.uc];
    if (!c) continue;
    if (c.title) r.title = c.title;
    if (c.roles) r.roles = c.roles;
    appliedAll.push({ uc: r.uc, why: c.why, module: r.module });
  }
  for (const a of ADDITIONS) {
    rows.push({ module: a.module, uc: a.uc, title: a.title, roles: a.roles });
    appliedAll.push({ uc: a.uc, why: a.why, module: a.module });
  }

  const unknown = Object.keys(CORRECTIONS).filter((uc) => !rows.some((r) => r.uc === uc));
  if (unknown.length) {
    // A correction for a row that no longer exists is a stale correction, and
    // silently skipping it is how this file would rot the way the SVGs did.
    console.error(`FAIL: corrections name rows absent from Table 4.1: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const byModule = new Map();
  for (const r of rows) {
    if (!byModule.has(r.module)) byModule.set(r.module, []);
    byModule.get(r.module).push(r);
  }

  for (const [moduleName, list] of byModule) {
    list.sort((a, b) => Number(a.uc.slice(3)) - Number(b.uc.slice(3)));
    const applied = appliedAll.filter((c) => c.module === moduleName);
    const file = path.join(OUT_DIR, `uc-${slug(moduleName)}.html`);
    fs.writeFileSync(file, render(moduleName, list, applied));
    console.log(
      `${path.basename(file).padEnd(18)} ${String(list.length).padStart(2)} use cases  ` +
        `${list[0].uc}..${list[list.length - 1].uc}` +
        (applied.length ? `  (${applied.length} corrected)` : '')
    );
  }

  console.log(`\n${rows.length} use cases across ${byModule.size} diagrams.`);
  console.log(`${appliedAll.length} rows drawn differently from Table 4.1:`);
  for (const c of appliedAll) console.log(`  ${c.uc.padEnd(7)} ${c.why}`);
}

main();
