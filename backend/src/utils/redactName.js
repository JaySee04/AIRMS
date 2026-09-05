// On-device redaction of the athlete NAME from a HoloMotion report page before
// the image is sent to the (possibly cloud) vision model.
//
// The rendered images are the only athlete data that leaves the machine during
// ingestion, and the printed name is the sole direct identifier on them (the
// phone number, when present, is only in the FILENAME, never on the page). We
// black out just the name value — age/gender/time and every score stay intact,
// so extraction (incl. the screening timestamp) is unaffected. The name appears
// only on page 1 (verified on both layouts), so only page 1 is redacted.
//
// Why OCR, not a fixed box: the two known layouts place the name at very
// different heights (~16% vs ~35% of the page), so we LOCATE it. Tesseract only
// has to find one plain label ("Name") — it does NOT read the scores (that's the
// vision model's job; see DESIGN_DECISIONS §13/§18). tesseract.js is pure WASM.
//
// Fail-closed: any OCR trouble → black out the whole top-left Information region
// (still clear of the right-hand gauges) rather than send page 1 unredacted.

// See pdfRender.js: the native canvas binary is loaded on demand so that a
// host unable to load it still serves everything except PDF import.
// One loader, shared with pdfRender.js. A bare require('canvas') here failed
// with a raw MODULE_NOT_FOUND on the same missing dependency; requiring it
// from pdfRender instead would be a CYCLE, since pdfRender requires this
// file. Hence its own module. See utils/canvasLoader.js.
const { loadCanvas } = require('./canvasLoader');

// The name sits in the top-left "Information" block; the score gauges are
// top-right (from ~0.6·W). OCR only this region — faster, and it keeps the gauge
// digits out of Tesseract. The crop starts at (0,0), so word boxes map straight
// back onto the page canvas.
const REGION_W = 0.58; // width fraction — past the longest sample name, left of the gauges
const REGION_H = 0.45; // height fraction — covers the name on both layouts
const NAME_LABEL = /^name[:：]?$/i; // tolerate fullwidth / ascii / missing colon
const OCR_TIMEOUT_MS = 20000; // recognize normally ~1s; cap it so a stale/hung
                              // worker can't hang the upload preview indefinitely.

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    // Tesseract caches its ~15 MB English model here on first use. The repo
    // folder is read-only on a serverless deployment, so fall back to the
    // platform temp directory: it is writable, it survives for the life of a
    // warm instance, and a cold start simply re-fetches the model. Overridable
    // for a host that offers real persistent storage.
    const cachePath = process.env.TESSERACT_CACHE_PATH
      || (process.env.VERCEL
        ? require('path').join(require('os').tmpdir(), 'airms-tesseract')
        : require('path').join(__dirname, '../../.tesseract'));
    workerPromise = createWorker('eng', undefined, { cachePath })
      .catch((err) => { workerPromise = null; throw err; }); // reset so a retry can reload
  }
  return workerPromise;
}

// Tear down the cached worker so the NEXT call builds a fresh one. Called after a
// recognize timeout/error — the likely cause of the "reader stops after the site
// sits idle" bug is a worker that went stale/unresponsive; recycling recovers it.
function resetWorker() {
  const p = workerPromise;
  workerPromise = null;
  Promise.resolve(p).then((w) => w && w.terminate && w.terminate()).catch(() => {});
}

// recognize() with a hard timeout — a hung worker rejects instead of hanging.
function recognizeWithTimeout(worker, buf) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OCR timed out after ${OCR_TIMEOUT_MS}ms`)), OCR_TIMEOUT_MS);
  });
  return Promise.race([worker.recognize(buf), timeout]).finally(() => clearTimeout(timer));
}

// Redact the athlete name on a rendered page-1 canvas, IN PLACE.
// Returns { redacted, method, box } for logging/verification.
async function redactNameOnCanvas(canvas) {
  const W = canvas.width, H = canvas.height;
  const cw = Math.round(W * REGION_W), ch = Math.round(H * REGION_H);
  const ctx = canvas.getContext('2d');
  const paint = (b) => { ctx.fillStyle = '#000'; ctx.fillRect(b.x, b.y, b.w, b.h); };
  const fallback = { x: 0, y: Math.round(H * 0.06), w: cw, h: ch }; // whole Information region

  let worker;
  try { worker = await getWorker(); }
  catch (err) { paint(fallback); return { redacted: true, method: 'fallback:ocr-unavailable', box: fallback, error: err.message }; }

  try {
    // Invert the region to dark-on-light (the report is white-on-dark, which
    // Tesseract reads far better flipped) and OCR it.
    const pre = loadCanvas().createCanvas(cw, ch);
    const pctx = pre.getContext('2d');
    pctx.drawImage(canvas, 0, 0, cw, ch, 0, 0, cw, ch);
    const img = pctx.getImageData(0, 0, cw, ch), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = 255 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    pctx.putImageData(img, 0, 0);

    const { data } = await recognizeWithTimeout(worker, pre.toBuffer('image/png'));
    const words = (data.words || []).filter((w) => w && w.bbox && (w.text || '').trim());
    const label = words.find((w) => NAME_LABEL.test(w.text.trim()));
    if (!label) { paint(fallback); return { redacted: true, method: 'fallback:name-not-found', box: fallback }; }

    // The value is the tokens on the label's text line, to its right.
    const lb = label.bbox, midY = (lb.y0 + lb.y1) / 2, lineH = lb.y1 - lb.y0;
    const value = words.filter((w) => w.bbox.x0 >= lb.x1 - 2 && Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - midY) <= lineH * 0.7);
    const pad = Math.max(4, Math.round(lineH * 0.3));
    let box;
    if (value.length) {
      const x0 = Math.min(...value.map((w) => w.bbox.x0)), y0 = Math.min(...value.map((w) => w.bbox.y0));
      const x1 = Math.max(...value.map((w) => w.bbox.x1)), y1 = Math.max(...value.map((w) => w.bbox.y1));
      box = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    } else {
      // Label read but no value tokens — cover from the label to the region edge.
      box = { x: Math.max(0, lb.x1 - 2), y: Math.max(0, lb.y0 - pad), w: cw - lb.x1, h: lineH + pad * 2 };
    }
    paint(box);
    return { redacted: true, method: value.length ? 'ocr' : 'ocr:label-only', box };
  } catch (err) {
    // A timeout/crash here likely means a stale worker — recycle it so the next
    // upload gets a fresh one instead of failing again.
    resetWorker();
    paint(fallback);
    return { redacted: true, method: 'fallback:ocr-error', box: fallback, error: err.message };
  }
}

module.exports = { redactNameOnCanvas };
