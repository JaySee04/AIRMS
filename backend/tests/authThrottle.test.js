// WHICH auth endpoints carry the brute-force throttle — pinned to the router.
//
// The throttle was mounted on the whole `/api/auth` router, so `GET /auth/me`
// counted against it. `DashboardLayout` calls that on every page mount, which
// made ordinary navigation consume the brute-force budget: measured against the
// deployed API, four successful `/auth/me` calls took `remaining` 29 → 28 → 27
// → 26, forgiven by nothing. Thirty page views in fifteen minutes locked a
// clinician out of their own session (SILENT_FAILURES 3r).
//
// The exempt list now has to stay in step with the router, and BOTH directions
// of drift are failures worth catching:
//
//   * an authenticated route missing from the list  -> rations normal use
//   * an UNAUTHENTICATED route added to the list    -> silently removes
//     brute-force protection, and nothing anywhere would say so
//
// So this reads `routes/auth.js` as TEXT and derives the answer rather than
// restating it. A hand-written list here would be a second copy of the thing
// under test, and would agree with itself while both were wrong — the failure
// this project keeps paying for.
const fs = require('fs');
const path = require('path');
const { AUTHENTICATED_AUTH_PATHS, shouldThrottle } = require('../src/utils/authThrottle');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8');

/**
 * Every route in auth.js, with whether it sits behind authMiddleware.
 *
 * Deliberately a source scan and not a require(): mounting the router would
 * build a Sequelize instance, and the question here is about the WIRING, which
 * is a property of the text.
 */
function routesInSource() {
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([A-Za-z_$][\w$]*)?/g;
  const out = [];
  let m;
  while ((m = re.exec(SRC)) !== null) {
    out.push({
      method: m[1].toUpperCase(),
      route: m[2],
      authed: m[3] === 'authMiddleware',
    });
  }
  return out;
}

describe('the auth throttle covers the unauthenticated surface', () => {
  const routes = routesInSource();

  // A scan that found nothing would make every assertion below vacuously true.
  // Both floors are asserted, because "no routes" and "no authenticated routes"
  // are different ways for the parser to silently stop working.
  it('found the router, and found both kinds of route', () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
    expect(routes.some((r) => r.authed)).toBe(true);
    expect(routes.some((r) => !r.authed)).toBe(true);
  });

  it('throttles every route an UNAUTHENTICATED caller can reach', () => {
    // This is the security half. /login, /forgot-password, /verify-otp and
    // /reset-password are what brute-force and credential-stuffing actually hit.
    const unguarded = routes
      .filter((r) => !r.authed)
      .filter((r) => !shouldThrottle(r.route))
      .map((r) => `${r.method} ${r.route}`);
    expect(unguarded).toEqual([]);
  });

  it('exempts every route that already requires a token', () => {
    // This is the availability half — the defect that was actually shipped.
    const rationed = routes
      .filter((r) => r.authed)
      .filter((r) => shouldThrottle(r.route))
      .map((r) => `${r.method} ${r.route}`);
    expect(rationed).toEqual([]);
  });

  it('exempts nothing that is not in the router', () => {
    // A stale entry would exempt a path that no longer exists, and the next
    // route to take that name would inherit the exemption silently.
    const known = new Set(routes.map((r) => r.route));
    for (const p of AUTHENTICATED_AUTH_PATHS) expect(known.has(p)).toBe(true);
  });

  it('names /me specifically, because that is the one navigation depends on', () => {
    // Pinned by name as well as by derivation: this is the exact call
    // DashboardLayout makes on every page mount, and the reason the defect was
    // reachable without anybody doing anything unusual.
    expect(shouldThrottle('/me')).toBe(false);
  });

  it('throttles an UNKNOWN path rather than exempting it', () => {
    // A 404 probe loop is still an unauthenticated caller working the auth
    // surface. Failing open here would let a scanner run uncapped.
    expect(shouldThrottle('/not-a-real-endpoint')).toBe(true);
    expect(shouldThrottle('')).toBe(true);
  });

  it('does not let a trailing slash buy an exemption', () => {
    // `/me/` and `/me` are the same endpoint to Express; a Set lookup would
    // treat them as different, and only one of them would be exempt. Harmless
    // in that direction — but the mirror case matters, so it is normalised.
    expect(shouldThrottle('/me/')).toBe(false);
  });
});
