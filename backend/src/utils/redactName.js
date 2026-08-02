// Local, on-device redaction of the athlete's NAME from a HoloMotion report
// page before the image is sent to the (possibly cloud) vision model.
//
// Why: the report images are the only thing that leaves the machine during
// ingestion, and the athlete's printed name is the single direct identifier on
// them (the phone number, when present, lives only in the filename, never on the
// page — see docs/DESIGN_DECISIONS §PII). Blacking the name out locally means
// the identity never reaches the model: the vision provider only ever sees a
// de-identified page. Age/gender/time and every score are LEFT INTACT — we cover
// only the name value, not the whole Information block — so extraction is
// unaffected and the screening timestamp still comes straight from the report.
//
// Why OCR instead of a fixed box: HoloMotion ships (at least) two page layouts
// that place the name at very different vertical positions (~16% of page height
// on the compact layout, ~35% on the expanded one), and the compact layout packs
// the Summary directly beneath it. No single fixed rectangle is both safe and
// sufficient across both, so we LOCATE the name with a lightweight local OCR
// pass and redact exactly where it is. The name only ever appears on page 1
// (verified against both sample layouts), so only page 1 needs this.
//
// tesseract.js is pure WASM (no native toolchain), so it avoids the node-canvas
// build pitfalls that forced the @napi-rs/canvas alias.

const { createCanvas } = require('canvas');

let workerPromise = null;

// One reused worker for the whole process (model load is the expensive part).
// cachePath keeps the downloaded language model beside the backend instead of
// littering the CWD; bundle eng.traineddata there for a fully offline install.
function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    const path = require('path');
    workerPromise = createWorker('eng', undefined, {
      cachePath: path.join(__dirname, '../../.tesseract'),
      // OEM/logging left default; we only need word boxes, not fast throughput.
    }).catch((err) => {
      // Reset so a later call can retry, but surface the failure to the caller
      // (which fails CLOSED — see redactNameOnCanvas).
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Match the "Name" label token, tolerating the report's fullwidth colon (：),
// an ASCII colon, or none (OCR sometimes drops the punctuation).
const NAME_LABEL = /^name[:：]?$/i;

// Redact the athlete name on a rendered HoloMotion page-1 canvas, IN PLACE.
// Strategy: OCR the top band (the Information block never sits lower than this),
// find the "Name" line, and paint a black box over the value to the right of
// the label. Fails CLOSED — if OCR can't find the name (or errors), it blacks
// out the top-left Information quadrant so the name is covered regardless; the
// gauges (top-right) and lower content survive either way.
// Returns { redacted, method, box } for logging/verification.
async function redactNameOnCanvas(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

  // Fail-closed fallback: the name is always top-left; the Total Score /
  // Exercise Risks gauges are top-right (x > ~0.6·W), so a left-column band
  // covers the name without touching them. Used only when OCR can't pinpoint it.
  const fallbackBox = { x: 0, y: Math.round(H * 0.08), w: Math.round(W * 0.58), h: Math.round(H * 0.34) };
  const paint = (b) => { ctx.save(); ctx.fillStyle = '#000000'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore(); };

  let worker;
  try {
    worker = await getWorker();
  } catch (err) {
    paint(fallbackBox);
    return { redacted: true, method: 'fallback:ocr-unavailable', box: fallbackBox, error: err.message };
  }

  try {
    // OCR only the top half (info block lives well within it) on an inverted,
    // grayscaled copy — the report is white-on-dark, which Tesseract reads far
    // better once flipped to dark-on-light.
    const bandH = Math.round(H * 0.5);
    const pre = createCanvas(W, bandH);
    const pctx = pre.getContext('2d');
    pctx.drawImage(canvas, 0, 0, W, bandH, 0, 0, W, bandH);
    const img = pctx.getImageData(0, 0, W, bandH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 255 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    pctx.putImageData(img, 0, 0);

    const { data } = await worker.recognize(pre.toBuffer('image/png'));
    const words = (data.words || []).filter((w) => w && w.bbox && (w.text || '').trim());

    // Locate the "Name" label, then the value tokens sharing its text line to
    // the right of it. Tesseract bbox coords are in the top-band's pixel space,
    // which shares this canvas's origin, so they map directly onto it.
    const label = words.find((w) => NAME_LABEL.test(w.text.trim()));
    if (label) {
      const lb = label.bbox;
      const lineMidY = (lb.y0 + lb.y1) / 2;
      const lineH = lb.y1 - lb.y0;
      const gaugeLimit = W * 0.58; // never cross into the right-hand gauges
      const value = words.filter((w) => {
        const b = w.bbox;
        const midY = (b.y0 + b.y1) / 2;
        return b.x0 >= lb.x1 - 2                       // right of the label
          && Math.abs(midY - lineMidY) <= lineH * 0.7  // same text line
          && b.x0 < gaugeLimit;                        // clear of the gauges
      });

      let box;
      if (value.length) {
        const x0 = Math.min(...value.map((w) => w.bbox.x0));
        const y0 = Math.min(...value.map((w) => w.bbox.y0));
        const x1 = Math.max(...value.map((w) => w.bbox.x1));
        const y1 = Math.max(...value.map((w) => w.bbox.y1));
        const pad = Math.max(4, Math.round(lineH * 0.25));
        box = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
      } else {
        // Label found but no value tokens read — cover from the label to the
        // gauge limit across the label's line height (name sits right there).
        const pad = Math.max(4, Math.round(lineH * 0.35));
        box = { x: Math.max(0, lb.x1 - 2), y: Math.max(0, lb.y0 - pad), w: Math.round(gaugeLimit - lb.x1 + 2), h: (lb.y1 - lb.y0) + pad * 2 };
      }
      paint(box);
      return { redacted: true, method: value.length ? 'ocr' : 'ocr:label-only', box };
    }

    // No "Name" line found at all → fail closed.
    paint(fallbackBox);
    return { redacted: true, method: 'fallback:name-not-found', box: fallbackBox };
  } catch (err) {
    paint(fallbackBox);
    return { redacted: true, method: 'fallback:ocr-error', box: fallbackBox, error: err.message };
  }
}

module.exports = { redactNameOnCanvas };
