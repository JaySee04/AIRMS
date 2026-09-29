// The contrast audit's page list must match the app's actual pages.
//
// WHY THIS EXISTS. `scripts/verify-contrast.js` carries a hand-written list of
// routes to sweep, and a hand-written list is only as good as the last time
// somebody compared it to reality. This one was wrong from the day it was
// written and nothing said so:
//
//   - it named `/executive/dashboard`, which HAS NEVER EXISTED. `executive` has
//     no pages of its own and lands on /admin/dashboard (lib/auth.ts). Next
//     served its 404 page — 170 characters, no theme, no contrast problems — and
//     the sweep counted it as a clean page.
//   - it was missing TEN real authenticated pages: /admin/audit, /admin/reports,
//     /admin/data-upload, /admin/profile, /medical/cohort-norms,
//     /medical/profile, /coach/reports, /coach/profile, /athlete/squad and
//     /athlete/profile.
//
// So "eleven authenticated pages, both themes" — the claim DESIGN_DECISIONS §120
// and §121 are measured over — was ten of twenty-one, and one of the eleven was
// an error page. The numbers in those sections stand for what they measured; the
// coverage sentence did not.
//
// A missing page is the silent direction: the audit reports a smaller clean
// sweep and nothing looks wrong. An extra one is loud NOW, because
// verify-contrast refuses a page it cannot measure — but it was silent before
// that too, which is exactly how the 404 survived.
//
// It also checks the ROLE, because a route listed under a role that cannot reach
// it bounces to that role's own landing page: a green reading of a page the
// audit never opened.
//
// THE DETECTORS ARE FUNCTIONS, AND EACH IS RUN OVER A PLANTED OFFENDER
// (`describe('canaries')` below). A corpus scanner that has never been shown
// finding anything is indistinguishable from one that cannot — SILENT_FAILURES
// 3l — and backend/tests/guardCanaries.test.js enforces exactly that here.
// These three were first checked by hand with `sed`, and the very first of those
// mutations was a no-op (anchored on leading whitespace against a mid-line
// entry) that reported 6/6 green. Hence: in the file, not in a shell.
import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname);
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'verify-contrast.js');

/** Routes with no DashboardLayout — sign-in and the account-recovery flow. */
const PUBLIC_ROUTES = new Set([
  '/', '/activate', '/forgot-password', '/reset-password', '/verify-otp',
]);

type Listed = { role: string; route: string };
type AppPage = { route: string; file: string; roles: string[] | null };

function pageFiles(dir: string, base = ''): Array<{ route: string; file: string }> {
  const out: Array<{ route: string; file: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full, `${base}/${entry.name}`));
    else if (entry.name === 'page.tsx') out.push({ route: base || '/', file: full });
  }
  return out;
}

/**
 * The roles a page admits.
 *
 * A page that merely RE-EXPORTS another (medical/cohort-norms does) has no
 * allowedRoles of its own — follow the re-export rather than treating it as
 * public, which would drop a real authenticated page from the comparison.
 */
function rolesOf(file: string, seen = new Set<string>()): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/allowedRoles=\{\[([^\]]*)\]\}/);
  if (m) return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  const re = src.match(/export\s*\{\s*default\s*\}\s*from\s*'([^']+)'/);
  if (re) {
    const target = path.resolve(path.dirname(file), `${re[1]}.tsx`);
    if (fs.existsSync(target)) return rolesOf(target, seen);
  }
  return null;
}

/** Pull the PAGES list out of the script as data. */
export function parseListed(script: string): Listed[] {
  const start = script.indexOf('const PAGES = [');
  if (start < 0) return [];
  const block = script.slice(start, script.indexOf('];', start));
  return [...block.matchAll(/\['([a-z]+)',\s*'([^']+)'\]/g)].map((m) => ({ role: m[1], route: m[2] }));
}

// ── the three detectors, as functions, so they can be aimed at bad input ─────

/** Authenticated pages the audit never visits. The SILENT direction. */
export function findMissing(listed: Listed[], pages: AppPage[]): string[] {
  const seen = new Set(listed.map((p) => p.route));
  return pages.filter((p) => !seen.has(p.route)).map((p) => p.route).sort();
}

/** Routes the audit visits that the app does not serve. The /executive/dashboard case. */
export function findPhantom(listed: Listed[], realRoutes: Set<string>): string[] {
  return [...new Set(listed.map((p) => p.route))].filter((r) => !realRoutes.has(r)).sort();
}

/** Pages visited as a role their own allowedRoles refuses. */
export function findWrongRole(listed: Listed[], pages: AppPage[]): string[] {
  const byRoute = new Map(pages.map((p) => [p.route, p.roles]));
  return listed
    .filter(({ role, route }) => {
      const roles = byRoute.get(route);
      return Array.isArray(roles) && !roles.includes(role);
    })
    .map(({ role, route }) => `${route} as ${role} (admits ${byRoute.get(route)!.join(', ')})`)
    .sort();
}

const script = fs.readFileSync(SCRIPT, 'utf8');
const listed = parseListed(script);
const allPages = pageFiles(APP);
const realRoutes = new Set(allPages.map((p) => p.route));
const authenticated: AppPage[] = allPages
  .filter((p) => !PUBLIC_ROUTES.has(p.route))
  .map((p) => ({ ...p, roles: rolesOf(p.file) }));

describe('verify-contrast covers every authenticated page', () => {
  it('parses a non-trivial list out of the script', () => {
    // Guards the guard: if the regex stops matching — the list is reformatted,
    // renamed, moved — every assertion below passes vacuously against an empty
    // set, which is the failure this whole file is about.
    expect(listed.length).toBeGreaterThan(20);
  });

  it('finds the app pages it is comparing against', () => {
    expect(authenticated.length).toBeGreaterThan(15);
  });

  it('lists every authenticated page', () => {
    expect(findMissing(listed, authenticated)).toEqual([]);
  });

  it('lists no route the app does not serve', () => {
    expect(findPhantom(listed, realRoutes)).toEqual([]);
  });

  it('visits each page as a role that page actually admits', () => {
    expect(findWrongRole(listed, authenticated)).toEqual([]);
  });

  it('resolves allowedRoles through a re-export', () => {
    // medical/cohort-norms is `export { default } from '../../admin/thresholds/page'`.
    // Without following that it reads as a public page and drops out of the
    // comparison entirely — a page the audit could stop covering unnoticed.
    const reexport = authenticated.find((p) => p.route === '/medical/cohort-norms');
    expect(reexport?.roles).toEqual(expect.arrayContaining(['admin', 'medical']));
  });
});

describe('canaries — each detector is shown catching a planted offender', () => {
  it('parseListed finds the entries it will be asked about', () => {
    // If this regex silently matched nothing, all three canaries below would
    // "pass" against empty input while proving nothing.
    expect(listed).toContainEqual({ role: 'coach', route: '/coach/reports' });
  });

  it('findMissing catches a page dropped from the list', () => {
    const planted = listed.filter((p) => p.route !== '/coach/reports');
    expect(findMissing(planted, authenticated)).toContain('/coach/reports');
    // …and does not cry wolf on the real list.
    expect(findMissing(listed, authenticated)).toEqual([]);
  });

  it('findPhantom catches a route the app does not serve', () => {
    // The actual defect: /executive/dashboard, listed for weeks, never existed.
    const planted = [...listed, { role: 'executive', route: '/executive/dashboard' }];
    expect(findPhantom(planted, realRoutes)).toContain('/executive/dashboard');
    expect(findPhantom(listed, realRoutes)).toEqual([]);
  });

  it('findWrongRole catches a page visited as a role it refuses', () => {
    // /admin/settings is admin-only; a coach sent there lands on their own
    // dashboard, and the audit would read THAT page while believing otherwise.
    const planted = [...listed, { role: 'coach', route: '/admin/settings' }];
    expect(findWrongRole(planted, authenticated).join(' ')).toContain('/admin/settings as coach');
    expect(findWrongRole(listed, authenticated)).toEqual([]);
  });

  it('rolesOf is what makes findWrongRole able to decide anything', () => {
    // A rolesOf that always returned null would make findWrongRole vacuous —
    // it skips anything whose roles it cannot read — so the canary above would
    // pass against a detector that can never report.
    const settings = authenticated.find((p) => p.route === '/admin/settings');
    expect(settings?.roles).toEqual(['admin']);
  });
});
