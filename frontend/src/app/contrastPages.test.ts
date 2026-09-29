// The contrast audit's page list must match the app's actual pages.
//
// WHY THIS EXISTS. `scripts/verify-contrast.js` carries a hand-written list of
// routes to sweep, and a hand-written list of things to check is only as good as
// the last time somebody compared it to reality. This one was wrong from the day
// it was written and nothing said so:
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
// sweep and nothing looks wrong. An extra one is the loud direction now, because
// verify-contrast refuses a page it cannot measure — but it was silent before
// that too, which is exactly how the 404 survived.
//
// It also checks the ROLE, because a route in the list under a role that cannot
// reach it bounces to that role's own landing page: a green reading of a page
// the audit never opened.
import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname);
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'verify-contrast.js');

/** Routes with no DashboardLayout — sign-in and the account-recovery flow. */
const PUBLIC_ROUTES = new Set([
  '/', '/activate', '/forgot-password', '/reset-password', '/verify-otp',
]);

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

describe('verify-contrast covers every authenticated page', () => {
  const script = fs.readFileSync(SCRIPT, 'utf8');
  const block = script.slice(script.indexOf('const PAGES = ['), script.indexOf('];', script.indexOf('const PAGES = [')));
  const listed = [...block.matchAll(/\['([a-z]+)',\s*'([^']+)'\]/g)].map((m) => ({ role: m[1], route: m[2] }));
  const listedRoutes = new Set(listed.map((p) => p.route));

  const authenticated = pageFiles(APP)
    .filter((p) => !PUBLIC_ROUTES.has(p.route))
    .map((p) => ({ ...p, roles: rolesOf(p.file) }));

  it('parses a non-trivial list out of the script', () => {
    // Guards the guard: if the regex above stops matching — the list is
    // reformatted, renamed, moved — every assertion below passes vacuously
    // against an empty set, which is the failure this whole file is about.
    expect(listed.length).toBeGreaterThan(20);
  });

  it('finds the app pages it is comparing against', () => {
    expect(authenticated.length).toBeGreaterThan(15);
  });

  it('lists every authenticated page', () => {
    const missing = authenticated.filter((p) => !listedRoutes.has(p.route)).map((p) => p.route);
    expect(missing).toEqual([]);
  });

  it('lists no route the app does not serve', () => {
    const real = new Set(pageFiles(APP).map((p) => p.route));
    const phantom = [...listedRoutes].filter((r) => !real.has(r));
    expect(phantom).toEqual([]);
  });

  it('visits each page as a role that page actually admits', () => {
    const byRoute = new Map(authenticated.map((p) => [p.route, p.roles]));
    const wrong = listed
      .filter(({ role, route }) => {
        const roles = byRoute.get(route);
        return Array.isArray(roles) && !roles.includes(role);
      })
      .map(({ role, route }) => `${route} as ${role} (admits ${byRoute.get(route)!.join(', ')})`);
    expect(wrong).toEqual([]);
  });

  it('resolves allowedRoles through a re-export', () => {
    // medical/cohort-norms is `export { default } from '../../admin/thresholds/page'`.
    // Without following that, it reads as a public page and drops out of the
    // comparison entirely — a page the audit could stop covering unnoticed.
    const reexport = authenticated.find((p) => p.route === '/medical/cohort-norms');
    expect(reexport?.roles).toEqual(expect.arrayContaining(['admin', 'medical']));
  });
});
