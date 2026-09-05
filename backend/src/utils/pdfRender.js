// Renders PDF pages to PNG images so any vision model can read them.
//
// Render rather than send the PDF: HoloMotion's data pages are jsPDF graphics
// with NO text layer — pdf-parse and pdfjs both return zero characters on real
// exports. Every vision provider accepts images; not all accept raw PDFs, so
// images are the provider-agnostic path.
//
// FULL PAGES, not fixed crops. The report ships in more than one layout — a
// compact variant packs the data section into ~3 pages, an expanded one spreads
// the same sections across ~6 — so crops tuned to one miss on the other.
// Whole pages are robust to where each section lands, and the data section is
// always first, before the image-analysis and prescription pages. The
// per-section crop optimisation was retired for this reason (2026-07-13).
//
// pdfjs's Node build requires("canvas"); package.json aliases that to
// @napi-rs/canvas (prebuilt, no node-gyp).

// `canvas` (aliased to the prebuilt @napi-rs/canvas) is a NATIVE binary, and it
// is loaded lazily rather than at module scope.
//
// Requiring it at load time meant the whole API refused to start if that binary
// could not be loaded — which is exactly what happens on a platform whose
// runtime differs from the machine the module was installed on. A serverless
// cold start then fails with FUNCTION_INVOCATION_FAILED before any route runs,
// so logging in, reading a dashboard or downloading a report all die because of
// a dependency that only the PDF import path needs.
//
// Deferred, the failure is contained: everything else serves normally and only
// an import reports the problem, with a message that names it.
// One loader, in its own module so this file and redactName.js can both use it
// without a require cycle — pdfRender already requires redactName.
const { loadCanvas } = require('./canvasLoader');
const { redactNameOnCanvas } = require('./redactName');

// How many leading pages to send to the model. The data section spans pages
// 1–3 (compact layout) or 1–6 (expanded layout); 6 covers both known variants.
// Overridable via VISION_MAX_PAGES for a report that spreads even further.
function maxPages() {
  const n = parseInt(process.env.VISION_MAX_PAGES, 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 6;
}

// Back-compat: some callers/tests still reference these.
const DATA_PAGES = [1, 2, 3, 4, 5, 6];

// Lazy ESM import of the pdfjs legacy build from CommonJS.
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

function renderScale() {
  const s = Number(process.env.VISION_RENDER_SCALE);
  return Number.isFinite(s) && s >= 1 && s <= 4 ? s : 2;
}

// Render full pages of a PDF buffer to base64 PNG strings.
// Returns [{ page, base64, mediaType }]. `scale` 2 keeps gauge digits legible
// for the model while holding each page well under typical image-size limits.
async function renderPdfPages(buffer, pages = DATA_PAGES, scale = renderScale()) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;

  const wanted = pages.filter((p) => p >= 1 && p <= doc.numPages);
  const out = [];
  for (const pageNum of wanted) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = loadCanvas().createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      page: pageNum,
      base64: canvas.toBuffer('image/png').toString('base64'),
      mediaType: 'image/png',
    });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}

// Render the data section of a HoloMotion report for vision extraction:
// the first N pages (see maxPages), each as a full captioned page. Robust to
// layout variation because it doesn't assume which page a section is on.
// Returns [{ page, label, base64, mediaType }].
async function renderForExtraction(buffer, scale = renderScale()) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;
  const total = doc.numPages;
  const n = Math.min(maxPages(), total);

  const out = [];
  for (let pageNum = 1; pageNum <= n; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = loadCanvas().createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    // Page 1 is the only page carrying the athlete's name (verified against both
    // HoloMotion layouts). Redact it locally BEFORE the image is serialised, so
    // the identity never reaches the vision model — fails closed on OCR trouble.
    if (pageNum === 1) {
      const r = await redactNameOnCanvas(canvas);
      if (!r.method.startsWith('ocr')) {
        console.warn(`[redact] page 1 name redacted via ${r.method}${r.error ? ` (${r.error})` : ''}`);
      }
    }
    out.push({
      page: pageNum,
      label: `HoloMotion report page ${pageNum} of ${total}`,
      base64: canvas.toBuffer('image/png').toString('base64'),
      mediaType: 'image/png',
    });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}

module.exports = { renderPdfPages, renderForExtraction, DATA_PAGES };
