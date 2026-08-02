// Visual check for the name-redaction pass (utils/redactName.js).
//
// Renders page 1 of a HoloMotion PDF, runs the local OCR name-redaction, and
// writes BEFORE and AFTER PNGs plus the detected box, so you can confirm the
// athlete's name is covered and nothing else (age/gender/time/gauges) is.
//
// Usage (from backend/):
//   node scripts/verify-redaction.js scripts/samples/<report>.pdf
//
// Output PNGs land in scripts/samples/redaction-out/ (gitignored). Pair this
// with `npm run verify:vision` on the SAME file: after redaction the vision
// pass should reproduce every score + the timestamp but return an EMPTY name.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { redactNameOnCanvas } = require('../src/utils/redactName');

(async () => {
  const pdfPath = process.argv[2];
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error('Usage: node scripts/verify-redaction.js <path-to-report.pdf>');
    process.exit(2);
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const scale = Number(process.env.VISION_RENDER_SCALE) || 2;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  const outDir = path.join(__dirname, 'samples', 'redaction-out');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(pdfPath).replace(/\.pdf$/i, '');
  fs.writeFileSync(path.join(outDir, `${base}.before.png`), canvas.toBuffer('image/png'));

  const t0 = Date.now();
  const result = await redactNameOnCanvas(canvas);
  fs.writeFileSync(path.join(outDir, `${base}.after.png`), canvas.toBuffer('image/png'));

  console.log(`page 1: ${canvas.width}x${canvas.height} @scale ${scale}`);
  console.log(`redaction: ${JSON.stringify(result)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`wrote before/after PNGs to ${outDir}`);
  await doc.destroy();
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
