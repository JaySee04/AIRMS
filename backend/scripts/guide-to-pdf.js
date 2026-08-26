// Render docs/SYSTEM_GUIDE.md to a PDF with pdfkit.
//
// Uses the project's own PDF dependency rather than a converter, and routes the
// text through the same WinAnsi guard the reports use: pdfkit's built-in
// Helvetica measures an out-of-set character as zero width and prints mojibake
// without throwing, and this document contains en-dashes, arrows and block
// characters that would land in exactly that trap.
//
// This is a MARKDOWN renderer, not a line printer. The first version drew each
// source line on its own and produced a document that could not be read:
//   - a paragraph following a table rendered in a narrow strip at the right and
//     ran off the page, because the table left doc.x parked in its last column;
//   - "**or IC number**" printed its asterisks, because the bold opened on one
//     source line and closed on the next and the per-line pattern matched
//     nothing;
//   - "#### The three sample reports" printed raw, because only #/##/### were
//     handled;
//   - section titles printed their backticks, because heading text skipped the
//     inline pass;
//   - table cells were truncated mid-sentence by equal columns plus `ellipsis`.
// Blocks are parsed first (joining wrapped lines), then rendered.
const fs = require('fs');
const path = require('path');
// Defaults to this package, so the script runs with no environment set up.
const B = process.env.BACKEND_DIR || path.join(__dirname, '..');
module.paths.unshift(path.join(B, 'node_modules'));
const PDFDocument = require(path.join(B, 'node_modules/pdfkit'));

const NAVY = '#0f2747';
const GOLD = '#b8892b';
const MUTED = '#5b6472';
const RULE = '#d8dde5';

// Same substitution table as utils/pdfDraw.js winAnsiSafe.
const SAFE = {
  '—': '-', '–': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '…': '...', '→': '->',
  '≥': '>=', '≤': '<=', '·': '-', '█': '#',
  '─': '-', '×': 'x', '±': '+/-',
};
const safe = (s) => String(s).replace(/[ -◿·×±]/g, (c) => SAFE[c] ?? '');

const md = fs.readFileSync(path.join(B, '..', 'docs', 'SYSTEM_GUIDE.md'), 'utf8');
const out = path.join(B, '..', 'AIRMS-System-Guide.pdf');

const M = 62;                       // left/right margin
const INK = '#1a1f28';
const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: M, right: M }, bufferPages: true });
doc.pipe(fs.createWriteStream(out));

const W = doc.page.width - M * 2;   // usable text width
const room = (h) => { if (doc.y + h > doc.page.height - 78) doc.addPage(); };

// ── inline markup ───────────────────────────────────────────────────────────
// Single-star and underscore emphasis has its markers stripped rather than
// slanted: only Helvetica and Helvetica-Bold hydrate in this OneDrive-backed
// node_modules (CLAUDE.md gotcha 7), so there is no oblique face to set, and
// printing the asterisks is worse than losing the slant.
const stripEmphasis = (s) => String(s)
  .replace(/\*([^*\n]+)\*/g, '$1')
  .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/g, '$1$2');

// Plain text of a markdown fragment — for measuring and for table cells.
const plain = (s) => stripEmphasis(String(s).replace(/\*\*/g, '').replace(/`/g, ''));

// Split a paragraph into styled runs: bold, `code`, or plain.
function segments(text) {
  const runs = [];
  for (const part of String(text).split(/(\*\*[\s\S]+?\*\*|`[^`]+`)/g)) {
    if (!part) continue;
    // A code span nested inside bold ('**... `airms2026`**') is matched by the
    // bold arm first, so its backticks have to come off here as well.
    if (part.startsWith('**') && part.endsWith('**')) runs.push({ t: stripEmphasis(part.slice(2, -2)).replace(/`/g, ''), bold: true });
    else if (part.startsWith('`') && part.endsWith('`')) runs.push({ t: part.slice(1, -1), code: true });
    else runs.push({ t: stripEmphasis(part) });
  }
  return runs.length ? runs : [{ t: '' }];
}

// Draw a paragraph of styled runs. ALWAYS returns doc.x to the left margin.
function rich(text, { size = 10, color = INK, indent = 0 } = {}) {
  const runs = segments(text);
  room(size * 2.2);
  doc.fontSize(size);
  doc.x = M + indent;
  const width = W - indent;
  runs.forEach((r, i) => {
    doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(r.code ? NAVY : color);
    doc.text(safe(r.t), { continued: i < runs.length - 1, width, align: 'left' });
  });
  doc.font('Helvetica').fillColor(INK);
  doc.x = M;
}

// ── tables ──────────────────────────────────────────────────────────────────
// Columns are sized in proportion to their content and cells WRAP. Equal
// columns plus `ellipsis` truncated real sentences mid-word ("Running the
// programme - norms,..."), losing information that exists only in this document.
function drawTable(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const c = r.slice(0, cols);
    while (c.length < cols) c.push('');
    return c.map(plain);
  });

  const want = new Array(cols).fill(1);
  norm.forEach((r) => r.forEach((c, i) => { want[i] = Math.max(want[i], Math.min(c.length, 60)); }));
  const sum = want.reduce((a, b) => a + b, 0);
  let widths = want.map((n) => Math.max(W * 0.14, (W * n) / sum));
  const scale = W / widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => w * scale);

  const PAD = 5;
  norm.forEach((cells, r) => {
    const head = r === 0;
    doc.fontSize(8.4).font(head ? 'Helvetica-Bold' : 'Helvetica');
    const hs = cells.map((c, i) => doc.heightOfString(safe(c) || ' ', { width: widths[i] - PAD * 2 }));
    const rowH = Math.max(...hs) + PAD * 2;
    room(rowH + 2);
    const y = doc.y;
    if (head) doc.rect(M, y, W, rowH).fill('#f2f4f8');
    doc.fontSize(8.4).font(head ? 'Helvetica-Bold' : 'Helvetica').fillColor(head ? NAVY : INK);
    let x = M;
    cells.forEach((c, i) => {
      doc.text(safe(c), x + PAD, y + PAD, { width: widths[i] - PAD * 2 });
      x += widths[i];
    });
    doc.y = y + rowH;
    doc.x = M;                       // never leave x parked in the last column
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
  });
  doc.font('Helvetica').fillColor(INK);
  doc.x = M;
  doc.moveDown(0.7);
}

// ── block parser ────────────────────────────────────────────────────────────
// Markdown wraps a paragraph across source lines, so anything spanning a line
// break — which here is most of the bold — must be joined BEFORE the inline pass.
const lines = md.split('\n');
const isTable = (l) => l.startsWith('|');
const isRule = (l) => /^-{3,}$/.test(l);
const isHead = (l) => /^#{1,6}\s/.test(l);
const isBullet = (l) => /^[-*]\s/.test(l);
const isNum = (l) => /^\d+\.\s/.test(l);
const starts = (l) => !l || isTable(l) || isRule(l) || isHead(l) || isBullet(l) || isNum(l);

const blocks = [];
for (let i = 0; i < lines.length;) {
  const L = lines[i].trim();
  if (!L) { i += 1; continue; }

  if (isTable(L)) {
    const rows = [];
    while (i < lines.length && isTable(lines[i].trim())) {
      const cells = lines[i].trim().split('|').slice(1, -1).map((c) => c.trim());
      if (!cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')))) rows.push(cells);
      i += 1;
    }
    if (rows.length) blocks.push({ kind: 'table', rows });
    continue;
  }
  if (isRule(L)) { blocks.push({ kind: 'rule' }); i += 1; continue; }
  if (isHead(L)) {
    const level = L.match(/^(#{1,6})/)[1].length;
    blocks.push({ kind: 'head', level, text: L.replace(/^#{1,6}\s+/, '') });
    i += 1;
    continue;
  }

  // A list item or paragraph absorbs the wrapped lines that follow it.
  const kind = isBullet(L) ? 'bullet' : isNum(L) ? 'num' : 'para';
  let text = L;
  let marker = '';
  if (kind === 'bullet') text = L.replace(/^[-*]\s+/, '');
  if (kind === 'num') { marker = L.match(/^(\d+)\./)[1]; text = L.replace(/^\d+\.\s+/, ''); }
  i += 1;
  while (i < lines.length && !starts(lines[i].trim())) { text += ' ' + lines[i].trim(); i += 1; }
  blocks.push({ kind, text, marker });
}

// ── render ──────────────────────────────────────────────────────────────────
const HEAD = {
  1: { size: 21, gap: 0.35, rule: false },
  2: { size: 14, gap: 0.45, rule: true },
  3: { size: 11, gap: 0.28, rule: false },
  4: { size: 10, gap: 0.22, rule: false },
};

for (const b of blocks) {
  if (b.kind === 'rule') {
    room(16);
    doc.moveDown(0.3);
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).strokeColor(RULE).lineWidth(1).stroke();
    doc.moveDown(0.7);
    doc.x = M;
    continue;
  }
  if (b.kind === 'head') {
    const h = HEAD[Math.min(b.level, 4)];
    room(h.size * 2.6);
    if (b.level > 1) doc.moveDown(0.45);
    doc.x = M;
    // Heading text goes through the inline stripper too — the section titles
    // carry `/admin/...` paths in backticks, which printed raw.
    doc.fontSize(h.size).font('Helvetica-Bold').fillColor(NAVY)
      .text(safe(plain(b.text)), { width: W });
    if (h.rule) {
      doc.moveDown(0.1);
      doc.moveTo(M, doc.y).lineTo(M + 46, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
    }
    doc.moveDown(h.gap);
    doc.x = M;
    continue;
  }
  if (b.kind === 'table') { drawTable(b.rows); continue; }
  if (b.kind === 'bullet') {
    room(22);
    const y = doc.y;
    doc.circle(M + 8, y + 4.6, 1.7).fill(GOLD);
    doc.y = y;
    rich(b.text, { indent: 16 });
    doc.moveDown(0.14);
    continue;
  }
  if (b.kind === 'num') {
    room(22);
    const y = doc.y;
    doc.fontSize(9.4).font('Helvetica-Bold').fillColor(GOLD)
      .text(`${b.marker}.`, M + 2, y + 1, { width: 14, lineBreak: false });
    doc.y = y;
    doc.x = M;
    rich(b.text, { indent: 18 });
    doc.moveDown(0.14);
    continue;
  }
  rich(b.text);
  doc.moveDown(0.2);
}

// Footer on every page, added after layout so the count is known.
const range = doc.bufferedPageRange();
for (let p = 0; p < range.count; p += 1) {
  doc.switchToPage(range.start + p);
  // The footer sits BELOW the bottom margin, and pdfkit treats text past that
  // boundary as overflow — it appends a fresh page per call. Dropping the
  // margin for the footer pass is the documented way round it.
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 46;
  doc.moveTo(M, y - 8).lineTo(doc.page.width - M, y - 8).strokeColor(RULE).lineWidth(0.5).stroke();
  doc.fontSize(7.6).font('Helvetica').fillColor(MUTED);
  doc.text('AIRMS - System Guide - Institut Sukan Negara', M, y, { width: 300, lineBreak: false });
  doc.text(`Page ${p + 1} of ${range.count}`, doc.page.width - 200, y, { width: 138, align: 'right', lineBreak: false });
}

doc.end();
console.log('wrote', out);
