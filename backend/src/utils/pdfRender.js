// Renders PDF pages (or cropped regions of them) to PNG images so any vision
// model can read them.
//
// Why render instead of sending the PDF? HoloMotion reports are produced by
// jsPDF and contain NO extractable text layer — the entire report (gauges,
// body maps, score bubbles) is baked in as graphics. pdf-parse / pdfjs text
// extraction both return zero characters (verified against real exports).
// Vision is the only reliable read, and every vision provider (OpenAI, Qwen,
// Anthropic, local Ollama, …) accepts images — but not all accept raw PDFs.
// Rendering to images is therefore the portable, provider-agnostic path.
//
// Why crop? Vision pricing scales with image area, and most of each page is
// content AIRMS never persists (joint illustrations, posture deviation bars,
// per-exercise detail tables). Cropping to the data-bearing bands cuts image
// tokens roughly in half again on top of the page-selection saving.
//
// pdfjs's Node build calls require("canvas") internally; package.json aliases
// "canvas" → @napi-rs/canvas (a prebuilt binary, no node-gyp compile needed).

const { createCanvas } = require('canvas');

// HoloMotion's data-bearing pages. Pages 4–12 are detailed angle-trajectory
// charts AIRMS does not persist, so we skip them to cut token cost roughly 4×.
const DATA_PAGES = [1, 2, 3];

// The data-bearing bands of each page, as fractions of page height (full
// width). Measured against a real HoloMotion export; bands carry generous
// margins because list sections (e.g. flagged muscles) can grow and push
// content down the page. Labels are sent to the model alongside each crop so
// it knows what it is looking at.
//   Page 1  top    — Information block (name / gender / age / time) + the
//                    Total Score and Exercise Risks gauges. Below: summary
//                    prose + joint illustrations (not persisted).
//   Page 2  top    — Myodynamia Deficiency + Muscle Tension lists.
//   Page 2  lower  — Risk Screening Results gauges (ROM / Stability /
//                    Symmetry). Between the two bands: posture deviation
//                    figures (not persisted).
//   Page 3  middle — Exercise Risk Evaluation circles (the 8 risk scores).
//                    Above: per-region subitem scores; below: detail tables
//                    (neither persisted).
const DATA_REGIONS = [
  { page: 1, top: 0.0, bottom: 0.26, label: 'Athlete information (Name / Gender / Age / time) with the Total Score and Exercise Risks gauges' },
  { page: 2, top: 0.0, bottom: 0.30, label: 'Muscle Imbalance lists: Myodynamia Deficiency and Muscle Tension' },
  { page: 2, top: 0.60, bottom: 0.92, label: 'Risk Screening Results gauges: ROM, Stability, Symmetry' },
  { page: 3, top: 0.20, bottom: 0.58, label: 'Exercise Risk Evaluation circles: Neck Pain, Shoulder Pain, Scoliosis, Lumbar Disc Herniation, Anterior pelvic tilt, Joint Pain, Ligament Strain, Ankle Sprain' },
];

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

// Render the data-bearing regions of a PDF buffer to base64 PNG strings.
// Each page is rasterised once and its bands cropped from the same canvas.
// Returns [{ page, label, base64, mediaType }] in DATA_REGIONS order.
// Set VISION_FULL_PAGES=1 to fall back to whole pages (e.g. if a future
// HoloMotion template shifts the layout and the bands miss content).
async function renderPdfRegions(buffer, regions = DATA_REGIONS, scale = renderScale()) {
  if (process.env.VISION_FULL_PAGES === '1') {
    const pages = await renderPdfPages(buffer, [...new Set(regions.map((r) => r.page))], scale);
    return pages.map((p) => ({ ...p, label: `Report page ${p.page}` }));
  }

  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;

  // Rasterise each needed page once.
  const pageCanvases = new Map();
  for (const pageNum of [...new Set(regions.map((r) => r.page))]) {
    if (pageNum < 1 || pageNum > doc.numPages) continue;
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pageCanvases.set(pageNum, canvas);
    page.cleanup();
  }
  await doc.destroy();

  const out = [];
  for (const region of regions) {
    const src = pageCanvases.get(region.page);
    if (!src) continue;
    const y = Math.floor(src.height * region.top);
    const h = Math.min(src.height - y, Math.ceil(src.height * (region.bottom - region.top)));
    if (h <= 0) continue;
    const crop = createCanvas(src.width, h);
    crop.getContext('2d').drawImage(src, 0, y, src.width, h, 0, 0, src.width, h);
    out.push({
      page: region.page,
      label: region.label,
      base64: crop.toBuffer('image/png').toString('base64'),
      mediaType: 'image/png',
    });
  }
  return out;
}

module.exports = { renderPdfPages, renderPdfRegions, DATA_PAGES, DATA_REGIONS };
