// Content-Security-Policy, with a per-request nonce.
//
// WHY THIS IS MIDDLEWARE AND NOT next.config.js. A CSP worth having names a
// `script-src`, and the only safe way to allow Next's own hydration and Flight
// payload scripts is a nonce that changes every request. `next.config.js`
// headers are static strings, so the policy has to be built per request — which
// is what this file is for. The four static headers (X-Frame-Options, nosniff,
// Referrer-Policy, Permissions-Policy) stay in next.config.js, because they do
// not vary and should cover static assets too.
//
// WHY IT WAS DEFERRED ONCE, AND WHAT CHANGED (DESIGN_DECISIONS §91.5 → §92).
// The first pass shipped `frame-ancestors` only and recorded a full CSP as a
// STATED GAP, on the grounds that a wrong `script-src` fails by silently
// blocking hydration — a blank dashboard, which is this project's defect class
// in its purest form — and so must be verified in a real browser rather than
// asserted from a config file. JC overruled the deferral. The condition
// attached to it still holds and has been met: this policy is verified against
// a PRODUCTION build in real Chrome, collecting actual CSP violation events,
// not reasoned about. See `scripts/verify-csp.js`.
//
// THE DIRECTIVE THAT MATTERS MOST HERE IS connect-src. AIRMS's web app and API
// are different origins in every environment (`:3000` vs `:5000` locally,
// airms-web.vercel.app vs airms-api.vercel.app hosted). A CSP that forgets this
// does not fail loudly: pages render, then every panel silently fetches
// nothing — indistinguishable from an outage, and exactly the failure the
// deferral was worried about. It is derived from NEXT_PUBLIC_API_URL, the same
// value lib/api.ts uses, so the two cannot disagree.

import { NextRequest, NextResponse } from 'next/server';

/** The API's ORIGIN (scheme://host:port), from the one env var lib/api.ts reads. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
  try {
    return new URL(raw).origin;
  } catch {
    // A malformed value must not take the whole app down with an unparseable
    // policy. Fall back to the documented default and let the request through;
    // a broken API URL is already visible everywhere else.
    return 'http://localhost:5000';
  }
}

/**
 * A fresh nonce per request.
 *
 * `crypto.getRandomValues` + `btoa`, NOT `Buffer` — middleware runs on the Edge
 * runtime, where `Buffer` is not defined. 16 bytes is well past the 128 bits
 * CSP Level 3 asks for.
 */
function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  const nonce = makeNonce();
  const api = apiOrigin();
  const dev = process.env.NODE_ENV !== 'production';

  const policy = [
    "default-src 'self'",

    // 'strict-dynamic' lets the nonced Next bootstrap load the chunks it needs
    // without naming each one, which is the only maintainable form for an app
    // whose script URLs are content-hashed at build time.
    //
    // 'unsafe-eval' in DEVELOPMENT ONLY: webpack HMR and React Refresh both
    // eval. Shipping it to production would negate most of the policy, so the
    // verification below deliberately runs against a production build — a dev
    // run would pass under the looser rule and prove nothing.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ''}`.trim(),

    // NOTE: no nonce here, on purpose. Under CSP Level 3 a nonce in style-src
    // makes the browser IGNORE 'unsafe-inline' — which would then block Next's
    // inlined critical CSS and the 829 React `style={{…}}` props that server-
    // render as style="" attributes. Inline styles cannot execute script, so
    // this is the standard and proportionate trade.
    "style-src 'self' 'unsafe-inline'",

    "img-src 'self' data: blob:",
    "font-src 'self' data:",

    // The cross-origin API, plus blob:/data: for the PDF download path
    // (fetch → blob → createObjectURL → anchor). In dev, also the websocket
    // HMR uses.
    `connect-src 'self' ${api} blob: data:${dev ? ' ws: wss:' : ''}`,

    // Nothing in AIRMS embeds a plugin, frames anything, or is framed.
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",

    // A dangling <base> would re-point every relative URL in the document.
    "base-uri 'self'",

    // The app posts only to itself; sign-in and every mutation go through
    // fetch(), so no form may target a foreign origin.
    "form-action 'self'",

    // Chart.js draws to canvas and tesseract/pdfjs run server-side, so nothing
    // here needs a worker.
    "worker-src 'self' blob:",
  ];
  if (!dev) policy.push('upgrade-insecure-requests');

  const value = policy.join('; ');

  // Next reads the nonce back off the REQUEST header and stamps it onto the
  // scripts it injects. Setting only the response header would produce a policy
  // whose nonce matches nothing — the blank-dashboard failure.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', value);
  return response;
}

export const config = {
  matcher: [
    // Documents only. Static assets and images do not execute in a document
    // context, and running middleware on every chunk would add latency for no
    // security gain. Prefetches are skipped for the same reason.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
