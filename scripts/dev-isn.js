// `npm run dev:isn` — the ISN INSTALLATION, run locally beside the Gemini one.
//
// AIRMS has two deployments with genuinely different capabilities, and since
// §112/§114 the difference is worth being able to SEE rather than reason about:
//
//   npm run dev       :3000 / :5000   a vision provider is configured.
//                                     Matches the Vercel instance, which has
//                                     VISION_API_KEY set (verified 2026-09-22:
//                                     /pdf/status reports gemini-flash-lite).
//
//   npm run dev:isn   :3100 / :5100   NO vision provider. Matches an ISN server
//                                     installed per docs/DEPLOY_ISN.md, where
//                                     the expected configuration is no API key
//                                     at all.
//
// Both run at once, so the same report can be dropped into each and the
// difference observed rather than trusted.
//
// THIS IS NOT A SECOND VERSION OF THE APP, and must not become one. It is the
// same code with one environment variable cleared, which is the whole point:
// every "ISN mode" behaviour is reached through `isVisionConfigured()`, so a
// divergence between the two instances can only ever be configuration. A forked
// codebase, or an AIRMS_MODE flag with its own branches, would create a second
// thing to keep correct and a class of bug that only appears in one of them.
//
// WHY CLEARING THE KEY RATHER THAN ADDING A FLAG. An ISN server does not have a
// "mode" — it has no credential. Reproducing the actual condition means this
// instance exercises the same code path the institution will, including the
// per-file 503 on the compact layout. A flag would be a simulation, and a
// simulation is exactly where "works locally, fails there" lives.
//
// `dotenv` does not override an already-set variable and an empty string counts
// as set, so backend/.env cannot put the key back. Verified: /pdf/status on
// this instance reports `configured:false, canIngest:true`.
//
// Ports are the documented second pair and overridable, like dev:alt:
//   AIRMS_WEB_PORT=3300 AIRMS_API_PORT=5300 npm run dev:isn
// Running dev:alt and dev:isn together collides on 3100/5100; the preflight
// refuses by name rather than starting something subtly wrong.
process.env.AIRMS_WEB_PORT = process.env.AIRMS_WEB_PORT || '3100';
process.env.AIRMS_API_PORT = process.env.AIRMS_API_PORT || '5100';

// Both, because visionConfig() reports the model and the status tile reads it —
// leaving a model name beside "not configured" reads as a broken install.
process.env.VISION_API_KEY = '';
process.env.VISION_MODEL = '';

// eslint-disable-next-line no-console
console.log(
  '\n  ISN instance — no vision provider.\n'
  + `  web :${process.env.AIRMS_WEB_PORT}   api :${process.env.AIRMS_API_PORT}\n`
  + '  Expanded 28-/38-page reports import exactly, with nothing sent anywhere.\n'
  + '  The compact 12-page layout is refused per file, and HoloMotion\'s written\n'
  + '  Summary is still recovered from the text layer (§114).\n',
);

require('./dev.js');
