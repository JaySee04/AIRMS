// Render docs/SYSTEM_GUIDE.md to a PDF with pdfkit.
//
// Uses the project's own PDF dependency rather than a converter, and routes the
// text through the same WinAnsi guard the reports use: pdfkit's built-in
// Helvetica measures an out-of-set character as zero width and prints mojibake
// without throwing, and this document contains en-dashes, arrows and block
// characters that would land in exactly that trap.
const fs = require('fs');
const path = require('path');
const B = process.env.BACKEND_DIR;
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
const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 62, right: 62 }, bufferPages: true });
doc.pipe(fs.createWriteStream(out));

const W = doc.page.width - 124;
const room = (h) => { if (doc.y + h > doc.page.height - 78) doc.addPage(); };

// Inline **bold** / `code` runs, so emphasis survives the conversion.
function rich(text, { size = 10, color = '#1a1f28', indent = 0 } = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  room(size * 2.4);
  doc.fontSize(size);
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    let t = p, font = 'Helvetica', col = color;
    if (p.startsWith('**')) { t = p.slice(2, -2); font = 'Helvetica-Bold'; }
    // Colour, not a font change. pdfkit reads a standard font's metrics from
    // disk on first use, and in this OneDrive-backed node_modules ONLY Helvetica
    // and Helvetica-Bold are hydrated - Oblique, Courier and Times all throw
    // UNKNOWN (CLAUDE.md gotcha 7). That is exactly the pair utils/pdfDraw.js
    // uses, which is why the reports render and this script did not.
    else if (p.startsWith('`')) { t = p.slice(1, -1); col = NAVY; }
    doc.font(font).fillColor(col)
      .text(safe(t), { continued: !last, indent: i === 0 ? indent : 0, width: W, align: 'left' });
  });
  doc.font('Helvetica').fillColor('#1a1f28');
}

const lines = md.split('\n');
let i = 0;
let inTable = false;
let tableRows = [];

function flushTable() {
  if (!tableRows.length) { inTable = false; return; }
  const cols = tableRows[0].length;
  const colW = W / cols;
  const rowH = 15;
  room(rowH * (tableRows.length + 1));
  tableRows.forEach((cells, r) => {
    room(rowH + 4);
    const y = doc.y;
    if (r === 0) doc.rect(62, y - 2, W, rowH + 2).fill('#f2f4f8');
    doc.fontSize(8.4).font(r === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(r === 0 ? NAVY : '#1a1f28');
    cells.forEach((c, ci) => {
      doc.text(safe(c.replace(/\*\*/g, '').replace(/`/g, '')), 66 + ci * colW, y + 2,
        { width: colW - 8, height: rowH, ellipsis: true, lineBreak: false });
    });
    doc.y = y + rowH;
    doc.moveTo(62, doc.y).lineTo(62 + W, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
  });
  doc.moveDown(0.6);
  tableRows = [];
  inTable = false;
}

while (i < lines.length) {
  const raw = lines[i];
  const L = raw.trim();
  i += 1;

  if (L.startsWith('|')) {
    const cells = L.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+:?$/.test(c.replace(/\s/g, '')))) continue; // separator row
    inTable = true; tableRows.push(cells); continue;
  }
  if (inTable) flushTable();

  if (!L) { doc.moveDown(0.45); continue; }
  if (L === '---') {
    room(16); doc.moveDown(0.3);
    doc.moveTo(62, doc.y).lineTo(62 + W, doc.y).strokeColor(RULE).lineWidth(1).stroke();
    doc.moveDown(0.7); continue;
  }
  if (L.startsWith('# ')) {
    room(46);
    doc.fontSize(21).font('Helvetica-Bold').fillColor(NAVY).text(safe(L.slice(2)), { width: W });
    doc.moveDown(0.35); continue;
  }
  if (L.startsWith('## ')) {
    room(40); doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor(NAVY).text(safe(L.slice(3)), { width: W });
    doc.moveDown(0.1);
    doc.moveTo(62, doc.y).lineTo(62 + 46, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(0.5); continue;
  }
  if (L.startsWith('### ')) {
    room(28); doc.moveDown(0.35);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(NAVY).text(safe(L.slice(4)), { width: W });
    doc.moveDown(0.25); continue;
  }
  if (L.startsWith('- ') || L.startsWith('* ')) {
    room(22);
    const y = doc.y;
    doc.circle(70, y + 4.6, 1.7).fill(GOLD);
    doc.y = y;
    rich(L.slice(2), { indent: 14 });
    doc.moveDown(0.12); continue;
  }
  if (/^\d+\.\s/.test(L)) {
    room(22);
    const n = L.match(/^(\d+)\./)[1];
    const y = doc.y;
    doc.fontSize(9.4).font('Helvetica-Bold').fillColor(GOLD).text(n + '.', 64, y + 1, { width: 14, lineBreak: false });
    doc.y = y;
    rich(L.replace(/^\d+\.\s/, ''), { indent: 16 });
    doc.moveDown(0.12); continue;
  }
  if (L.startsWith('> ')) { rich(L.slice(2), { color: MUTED, indent: 10 }); doc.moveDown(0.15); continue; }

  rich(L);
  doc.moveDown(0.18);
}
flushTable();

// Footer on every page, added after layout so the count is known.
const range = doc.bufferedPageRange();
for (let p = 0; p < range.count; p += 1) {
  doc.switchToPage(range.start + p);
  // The footer sits BELOW the bottom margin, and pdfkit treats text past that
  // boundary as overflow - it appends a fresh page per call. The first run
  // produced 18 pages for 6 pages of content, each spare one carrying nothing
  // but the footer that created it. Dropping the margin for the footer pass is
  // the documented way round it.
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 46;
  doc.moveTo(62, y - 8).lineTo(doc.page.width - 62, y - 8).strokeColor(RULE).lineWidth(0.5).stroke();
  doc.fontSize(7.6).font('Helvetica').fillColor(MUTED);
  doc.text('AIRMS - System Guide - Institut Sukan Negara', 62, y, { width: 300, lineBreak: false });
  doc.text(`Page ${p + 1} of ${range.count}`, doc.page.width - 200, y, { width: 138, align: 'right', lineBreak: false });
}

doc.end();
console.log('wrote', out);
