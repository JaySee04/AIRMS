// Loading the native canvas binding, once, with an error that says what broke.
//
// Its own module for the same reason `periodScores.js` is: `pdfRender.js` and
// `redactName.js` both need it and pdfRender already requires redactName, so
// putting the loader in either one makes a require CYCLE. That is worse than
// the duplication it removes — under a cycle the second module gets a partially
// built exports object, `loadCanvas` is `undefined`, and the failure is
// "loadCanvas is not a function" at redaction time rather than anything about
// canvas.
//
// The message matters because this dependency genuinely can be absent. The
// package aliases `canvas` to `@napi-rs/canvas` (prebuilt) precisely because
// node-canvas needs a native compiler and does not build on this Windows/Node
// setup. When it is missing, PDF import stops working and everything else
// keeps working — so the error says which half is affected rather than leaving
// a raw MODULE_NOT_FOUND for somebody to interpret.

let cached = null;

function loadCanvas() {
  if (cached) return cached;
  try {
    // eslint-disable-next-line global-require
    cached = require('canvas');
    return cached;
  } catch (err) {
    const e = new Error(
      'PDF rendering is unavailable on this host: the native canvas library '
      + `failed to load (${err.message}). Screening import needs it; the rest of `
      + 'AIRMS does not. See CLAUDE.md gotcha 6 — install the prebuilt '
      + '@napi-rs/canvas alias rather than node-canvas.',
    );
    e.expose = true; // the operator needs this sentence, not a generic 500
    throw e;
  }
}

module.exports = { loadCanvas };
