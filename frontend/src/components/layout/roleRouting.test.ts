// EVERY ROLE CAN GET TO ITS OWN PAGES, AND THOSE PAGES LET IT IN.
//
// THE BUG THIS EXISTS FOR, which was live on the deployed instance from
// 2026-08-08 to 2026-09-16. `Topbar.tsx` keyed its role label and its profile
// route as `Record<string, string>`, and both were written before `executive`
// existed. Indexing a string-keyed record yields `string`, never
// `string | undefined`, so TypeScript reported nothing.
//
// What it cost: `PROFILE_ROUTES['executive']` was `undefined`, and
// `<Link href={undefined}>` throws while rendering, so the account dropdown
// never mounted. **Sign out lives only in that dropdown.** An executive could
// not sign out, and could not open their profile — `/admin/profile` admits them,
// but nothing linked to it. The topbar read "Signed in as" and then stopped.
//
// Typing the maps `Record<Role, …>` makes a MISSING role a build error, which is
// the stronger half of the fix and needs no test. This covers the half a type
// cannot: that the route each map POINTS AT actually admits that role. Setting
// executive's profile to a page whose `allowedRoles` omits executive compiles
// perfectly and bounces the user straight back out again.
//
// It is a source scan for `pageWiring.test.ts`'s stated reason — the property is
// a fact about how the call site is written, and mounting five dashboards to
// read one map is a large brittle investment. What it cannot see: a route
// computed at runtime.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const ROLES = ['athlete', 'medical', 'admin', 'coach', 'executive'] as const;
type Role = typeof ROLES[number];

/**
 * Pull `key: '/value'` pairs out of one named object literal.
 *
 * Fails loudly when the map cannot be found or comes back the wrong size,
 * rather than returning a plausible subset — a parser that silently finds some
 * of what it was looking for and renders a convincing result is DD §56.3, and
 * it has already cost this project one wrong table.
 */
function parseMap(file: string, name: string): Record<string, string> {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(`const ${name}`);
  expect(start).toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  const close = src.indexOf('};', open);
  expect(close).toBeGreaterThan(open);
  const body = src.slice(open, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) out[m[1]] = m[2];
  expect(Object.keys(out).length).toBe(ROLES.length);
  return out;
}

/** The `allowedRoles` a page declares, read from its source. */
function allowedRoles(route: string): string[] {
  const file = path.join(SRC, 'app', `${route}/page.tsx`);
  expect(fs.existsSync(file)).toBe(true);
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/allowedRoles=\{\[([^\]]*)\]\}/);
  expect(m).toBeTruthy();
  return (m as RegExpMatchArray)[1].split(',')
    .map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
}

const PROFILE_ROUTES = parseMap(path.join(__dirname, 'Topbar.tsx'), 'PROFILE_ROUTES');
const ROLE_LABELS = parseMap(path.join(__dirname, 'Topbar.tsx'), 'ROLE_LABELS');
const LANDING = parseMap(path.join(SRC, 'lib', 'auth.ts'), 'LANDING');

describe('role routing', () => {
  it.each(ROLES)('%s has a profile route, and that page admits it', (role: Role) => {
    const route = PROFILE_ROUTES[role];
    expect(route).toBeTruthy();
    expect(allowedRoles(route)).toContain(role);
  });

  it.each(ROLES)('%s has a landing page, and that page admits it', (role: Role) => {
    const route = LANDING[role];
    expect(route).toBeTruthy();
    expect(allowedRoles(route)).toContain(role);
  });

  // A blank label renders as "Signed in as" followed by nothing, which is how
  // the executive gap first showed on screen.
  it.each(ROLES)('%s has a non-empty topbar label', (role: Role) => {
    expect((ROLE_LABELS[role] || '').trim().length).toBeGreaterThan(0);
  });

  // The redirect target of a refused page must never be a page that refuses the
  // same user, which would bounce them between two routes for ever.
  it('no landing page redirects the role it is the landing page for', () => {
    for (const role of ROLES) expect(allowedRoles(LANDING[role])).toContain(role);
  });
});
