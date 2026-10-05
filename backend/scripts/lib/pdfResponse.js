// DID A COMPLETE PDF ARRIVE? One definition, because the answer is subtle.
//
// THE RULE. A 200 is not evidence. The report routes STREAM: startDoc() sets
// the headers and pipes the document, so the status is written BEFORE any
// drawing happens. Once a byte is out, `res.headersSent` is true and the catch
// in those handlers cannot answer 500 — it calls res.end(). A failure halfway
// through composition therefore arrives as **HTTP 200, Content-Type
// application/pdf, and a file that may not open**.
//
// So the only sound test is the document's own structure: the `%PDF-` header
// says a PDF started, and the `%%EOF` trailer — which pdfkit writes in end() —
// says it FINISHED. A check that reads the status code is asking the one
// question the transport cannot answer.
//
// WHY THIS IS A SHARED MODULE AND NOT THREE COPIES. It was three:
// verify-report-downloads.js, deploy-verify-rollback.js and
// tests/reportRoutes.test.js each had its own. The rule is four lines, which is
// exactly the size at which somebody "simplifies" one of them back to
// `expect(res.status).toBe(200)` — and that edit is INVISIBLE, because it passes
// on every healthy response and only diverges on the failure the check exists
// for. One definition means the simplification has to be argued with here, next
// to the reason.

/** pdfkit writes the trailer in end(); 2 KB is ample room for it. */
const TRAILER_WINDOW = 2048;

/**
 * Is this buffer a PDF that was finished rather than cut off?
 *
 * @param {Buffer} buf
 * @returns {{complete: boolean, magic: boolean, trailer: boolean, bytes: number}}
 *
 * `magic` without `trailer` is the interesting case and the one worth naming
 * separately in output: it means composition started and died, which is a
 * served-but-broken document rather than a refusal.
 */
function inspectPdf(buf) {
  const bytes = buf ? buf.length : 0;
  // latin1, not utf8: these are byte markers, and utf8 decoding of binary PDF
  // content can replace bytes and lose a marker that is really there.
  const magic = bytes >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-';
  const trailer = bytes > 0
    && buf.slice(-Math.min(TRAILER_WINDOW, bytes)).toString('latin1').includes('%%EOF');
  return { complete: magic && trailer, magic, trailer, bytes };
}

/**
 * Download something that is supposed to be a PDF and report what came back.
 *
 * Returns a flat verdict so callers do not each re-derive it:
 *   delivered  a PDF body arrived at all (content-type said so)
 *   complete   ...and it has both markers
 *   note       one line fit for a terminal, naming the fault when there is one
 *
 * A non-PDF response is NOT an error here — a 403 is a correct answer for most
 * role/report pairs — so the caller decides whether `delivered: false` is a
 * failure. `message` carries the API's own text when it answered JSON, because
 * "Coaches can only download reports for athletes in their assigned sport" is
 * the difference between a broken feature and a working scope check.
 */
async function fetchPdf(url, { headers = {} } = {}) {
  let r;
  try {
    r = await fetch(url, { headers });
  } catch (e) {
    return {
      status: 'ERR', delivered: false, complete: false, bytes: 0, message: null, note: e.cause?.code || e.message,
    };
  }
  const contentType = (r.headers.get('content-type') || '').split(';')[0];
  if (!contentType.includes('application/pdf')) {
    const text = await r.text().catch(() => '');
    let message = text.slice(0, 120);
    try { message = JSON.parse(text).message || message; } catch { /* not json */ }
    return {
      status: r.status, delivered: false, complete: false, bytes: 0, contentType, message, note: message,
    };
  }
  const v = inspectPdf(Buffer.from(await r.arrayBuffer()));
  return {
    status: r.status,
    delivered: true,
    complete: r.status === 200 && v.complete,
    bytes: v.bytes,
    contentType,
    message: null,
    disposition: r.headers.get('content-disposition') || null,
    note: v.complete
      ? `${(v.bytes / 1024).toFixed(0)} KB`
      // Named precisely, because the two faults need different responses: no
      // trailer is a crash during composition (look at the function's stderr);
      // no header is not a PDF at all (look at what is proxying the request).
      : `INCOMPLETE — ${v.magic ? 'started but never finished' : 'no %PDF- header'}`
        + ` (${v.bytes} B, header=${v.magic}, trailer=${v.trailer})`,
  };
}

module.exports = { inspectPdf, fetchPdf, TRAILER_WINDOW };
