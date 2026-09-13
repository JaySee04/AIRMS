const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // This package IS the build root. Say so, rather than letting Next guess.
  //
  // There are three lockfiles in this repo (root, backend, frontend) because the
  // packages are deliberately self-contained — see the shared-facts note in
  // CLAUDE.md, which is a DEPLOYMENT constraint, not a preference: Vercel builds
  // airms-web with Root Directory `frontend`, so the repo root is not in the
  // build context at all. Next's workspace inference does not know that and was
  // picking the repo root, warning on every `next lint`, `next build` and jest
  // run that it "may not be correct".
  //
  // It was right to doubt itself. File tracing decides which files are bundled
  // into the deployed output; rooted one level too high it traces against a tree
  // the build will never see. The warning is also the cost that matters most —
  // a permanent one nobody can act on is how a REAL warning goes unread later.
  outputFileTracingRoot: __dirname,

  // Security headers for the WEB APP.
  //
  // The API has had the full helmet set for months; this package had none — and
  // this is the half a clinician's browser actually loads, and the half that
  // renders athlete names, IC numbers and clinical notes. Hardening the API
  // while leaving the app bare protects the data in transit and not the screen
  // it lands on.
  //
  // Each of these was checked against what AIRMS actually does rather than
  // copied from a checklist: the app contains no <iframe>, <embed> or <object>
  // (so frame-blocking breaks nothing — PDF reports are fetched with an auth
  // header and saved through a blob URL, never framed), and calls no
  // geolocation, camera or microphone API (so denying them costs nothing and
  // means a future dependency cannot quietly start asking).
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // Clickjacking. An attacker framing a signed-in AIRMS dashboard can
        // bait clicks onto real controls — and this app's controls include
        // declaring an athlete injured and overriding a clinical band.
        //
        // `frame-ancestors` is the modern form and now lives in the FULL CSP in
        // src/middleware.ts, which has to be built per request because it
        // carries a nonce. It is deliberately NOT also declared here: two
        // Content-Security-Policy headers are enforced as an intersection,
        // which works but means the effective policy is written in two files —
        // and a future edit to one would silently tighten or loosen the other.
        // X-Frame-Options stays, for browsers that ignore frame-ancestors.
        { key: 'X-Frame-Options', value: 'DENY' },

        { key: 'X-Content-Type-Options', value: 'nosniff' },

        // Referrer. Paths here carry IC numbers (/medical/athlete/<ic>), which
        // encode date of birth, birth state and sex — the same identifier
        // utils/logger.js refuses to log and /teammates withholds. Sending a
        // full URL to any third party would leak it right back out, so cross
        // origin gets the origin only.
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      ],
    }];
  },

  // THE FULL CSP LIVES IN src/middleware.ts (2026-09-13, DD §92). It was a
  // stated gap here for exactly one day: a script-src policy needs a
  // per-request nonce, which a static header cannot carry. The condition that
  // justified deferring it — that it be verified in a real browser against a
  // PRODUCTION build rather than asserted from config — was kept, and is
  // `npm run verify:csp`.
};

module.exports = nextConfig;
