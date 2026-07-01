// Renders PDF pages to PNG images so any vision model can read them.
//
// Why render instead of sending the PDF? HoloMotion reports are produced by
// jsPDF and contain NO extractable text layer — the entire report (gauges,
// body maps, score bubbles) is baked in as graphics. pdf-parse / pdfjs text
// extraction both return zero characters (verified against real exports).
// Vision is the only reliable read, and every vision provider (OpenAI, Qwen,
// Anthropic, local Ollama, …) accepts images — but not all accept raw PDFs.
// Rendering to images is therefore the portable, provider-agnostic path.
//
// pdfjs's Node build calls require("canvas") internally; package.json aliases
// "canvas" → @napi-rs/canvas (a prebuilt binary, no node-gyp compile needed).

const { createCanvas } = require('canvas');

// HoloMotion's data-bearing pages. Pages 4–12 are detailed angle-trajectory
// charts AIRMS does not persist, so we skip them to cut token cost roughly 4×.
const DATA_PAGES = [1, 2, 3];

// Lazy ESM import of the pdfjs legacy build from CommonJS.
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

// Render the given pages of a PDF buffer to base64 PNG strings.
// Returns [{ page, base64, mediaType }]. `scale` 2 keeps gauge digits legible
// for the model while holding each page well under typical image-size limits.
async function renderPdfPages(buffer, pages = DATA_PAGES, scale = 2) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;

  const wanted = pages.filter((p) => p >= 1 && p <= doc.numPages);
  const out = [];
  for (const pageNum of wanted) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
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

module.exports = { renderPdfPages, DATA_PAGES };
