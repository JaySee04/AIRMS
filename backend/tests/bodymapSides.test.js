// WHICH SIDE OF THE BODY THE PDF FIGURE PAINTS A READING ON (DD §168).
//
// The atlas keys its paths `left`/`right` by where they sit on the page. A
// person facing you has their right on your left, so on the FRONT figure the
// page's left half is the athlete's right. The website and the PDF both painted
// page-sides from 2026-10-09 (when the redraw that carried `anterior()` was
// reverted, §152) until Dr Thung spotted the drawing on 2026-11-26.
//
// Asserted on what muscleFigure PAINTS, not on sideTagFor's return values: a
// correct helper that the drawing code stopped calling would pass a helper
// test, which is the winAnsiSafe shape this project keeps meeting.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { muscleFigure } = require('../src/utils/pdfDraw');
const { bodyFront, bodyBack, sideTagFor } = require('../src/utils/bodymap');

// Records the fill colour of every path, keyed by its exact `d` string.
function paintedColours(subitems) {
  const doc = new PDFDocument({ autoFirstPage: true });
  const colours = new Map();
  let lastD = null;
  const origPath = doc.path.bind(doc);
  doc.path = (d) => { lastD = d; return origPath(d); };
  const origFS = doc.fillAndStroke.bind(doc);
  doc.fillAndStroke = (fill, stroke) => { if (lastD) colours.set(lastD, fill); return origFS(fill, stroke); };
  muscleFigure(doc, subitems);
  doc.end();
  return colours;
}

const deltoids = (fig) => (fig === 'front' ? bodyFront : bodyBack).find((p) => p.slug === 'deltoids').path;
const colourOf = (colours, paths) => {
  const seen = new Set(paths.map((d) => colours.get(d)));
  expect(seen.size).toBe(1);
  return [...seen][0];
};

describe('PDF body figure sides', () => {
  // A weak LEFT shoulder and a strong right one, so the two sides differ.
  const colours = paintedColours({ shoulder: { romL: 20, stabL: 20, romR: 95, stabR: 95 } });

  it('paints the athlete\'s LEFT on the page\'s RIGHT half of the front figure', () => {
    const frontPageRight = colourOf(colours, deltoids('front').right);
    const backPageLeft = colourOf(colours, deltoids('back').left);
    // Both are the athlete's left shoulder, so they must carry the same reading.
    expect(frontPageRight).toBe(backPageLeft);
  });

  it('paints the athlete\'s RIGHT on the page\'s LEFT half of the front figure', () => {
    const frontPageLeft = colourOf(colours, deltoids('front').left);
    const backPageRight = colourOf(colours, deltoids('back').right);
    expect(frontPageLeft).toBe(backPageRight);
    expect(frontPageLeft).not.toBe(colourOf(colours, deltoids('front').right));
  });

  it('keeps the backend copy of sideTagFor identical to the frontend\'s', () => {
    // The two packages cannot import each other (DD §53), so the copy is pinned
    // by behaviour here and by text against the frontend source below.
    expect([sideTagFor('front', 'left'), sideTagFor('front', 'right'),
      sideTagFor('back', 'left'), sideTagFor('back', 'right')]).toEqual(['R', 'L', 'L', 'R']);
    const fe = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/dashboard/bodymap-data/muscles.ts'), 'utf8');
    expect(fe).toContain("if (fig === 'front') return atlasSide === 'left' ? 'R' : 'L';");
    expect(fe).toContain("return atlasSide === 'left' ? 'L' : 'R';");
  });
});
