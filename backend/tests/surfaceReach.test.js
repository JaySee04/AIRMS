// WHERE AN ENDPOINT LETS IN A ROLE THAT NO PAGE OFFERS ANYTHING TO.
//
// Found 2026-09-12 while checking my own use-case additions: I wrote
// "Medical Staff, Administrator" as the actors on the personal watchlist,
// because `routes/watchlist.js` permits both. An administrator cannot reach it.
// The only UI is on `medical/dashboard`, whose gate is
// `allowedRoles={['medical']}` — so the capability is real, permitted, and
// unreachable for one of the two roles it names.
//
// This is §42's shape exactly: `POST /api/users` accepted four roles for weeks
// while the Personnel form offered two, so an administrator could not create a
// colleague without editing the database. `accountLifecycle.test.js` pins that
// pair because "accepted but not offered" is invisible while the reverse
// crashes. Same asymmetry here, and it had reached a graded document.
//
// WHAT THIS DOES AND DOES NOT CLAIM. It is not an argument that every permitted
// role must have a screen. Some of these gaps are defensible and one is
// probably correct as it stands. What it refuses is for the gap to be a
// SILENCE — each one is declared below with a reason, so the next person to
// write an actor column reads the list instead of the rbac call.
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', 'src');
const PAGES = path.join(__dirname, '..', '..', 'frontend', 'src', 'app');

const ROLE_LABEL = {
  medical: 'Medical Staff', admin: 'Administrator', coach: 'Coach',
  executive: 'Executive', athlete: 'Athlete',
};

// Reach the endpoint grants, minus reach any page actually offers. Every entry
// needs a reason, and the reason is the point.
const CAPABILITIES = [
  {
    name: 'the decision worklist',
    routeFile: 'routes/decisions.js',
    roleConst: 'VIEW_ROLES',
    endpoint: '/decisions',
    reachWithoutSurface: {
      admin: 'No admin page renders the worklist. Defensible — admin is the '
        + 'institutional role (§12: Dr Thung), and "who do I see next" is a '
        + 'clinical question — but it is JC\'s call, not an accident of layout. '
        + 'The endpoint would serve it today.',
      athlete: 'An athlete\'s worklist is a list containing themselves, which '
        + 'their own dashboard already is. The endpoint scopes them to their own '
        + 'row so the shared ranking cannot leak, which is why the role is '
        + 'permitted at all.',
    },
  },
  {
    name: 'marking a screening reviewed',
    routeFile: 'routes/decisions.js',
    roleConst: 'MARK_ROLES',
    endpoint: '/decisions/reviewed',
    reachWithoutSurface: {
      admin: 'Follows the worklist above — no admin surface to mark from.',
    },
  },
  {
    name: 'the personal watchlist',
    routeFile: 'routes/watchlist.js',
    roleConst: 'ROLES',
    endpoint: '/watchlist',
    reachWithoutSurface: {
      admin: 'The only UI is on medical/dashboard, which admin cannot open. '
        + 'This is the one that reached Chapter 4 as though an administrator had '
        + 'it (UC-65, corrected 2026-09-12). Either give admin a surface or drop '
        + 'the role from the endpoint — leaving both is what produced the wrong '
        + 'actor column.',
    },
  },
];

/** The role list a route declares, read as text — requiring it builds models. */
function endpointRoles(routeFile, constName) {
  const src = fs.readFileSync(path.join(BACKEND, routeFile), 'utf8');
  const m = src.match(new RegExp(`const ${constName} = (\\[[^\\]]+\\])`));
  expect(m).not.toBeNull(); // floor: the constant still exists under that name
  const roles = JSON.parse(m[1].replace(/'/g, '"'));
  expect(roles.length).toBeGreaterThan(0);
  return roles;
}

/** Every page.tsx under app/, with the roles its gate admits. */
function pages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'page.tsx') {
        const src = fs.readFileSync(p, 'utf8');
        const m = src.match(/allowedRoles=\{\[([^\]]*)\]\}/);
        out.push({
          path: p,
          src,
          roles: m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [],
        });
      }
    }
  };
  walk(PAGES);
  return out;
}

/** Every component file under src/components, with its exported name. */
function components() {
  const root = path.join(PAGES, '..', 'components');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) {
        out.push({ name: path.basename(e.name, '.tsx'), src: fs.readFileSync(p, 'utf8') });
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Which roles can reach a page that USES this endpoint — directly or through a
 * component it renders.
 *
 * Resolved by ENDPOINT PATH rather than by component name, and the first
 * version was not: it looked for a `<Watchlist>` tag, and the watchlist UI is
 * written inline on `medical/dashboard` with no component of its own. The
 * per-capability floor caught that, which is the only reason this note is a
 * design note and not a defect.
 *
 * One level of indirection is enough for every capability here, and the floor
 * below is what makes that assumption safe to hold: a capability whose caller
 * sits two levels down reports no host and fails rather than passing.
 */
function surfacedRoles(all, comps, endpoint) {
  const usesIt = (src) => src.includes(`'${endpoint}'`) || src.includes(`\`${endpoint}`)
    || new RegExp(`['\`]${endpoint.replace(/\//g, '\\/')}[/'\`]`).test(src);

  const direct = all.filter((p) => usesIt(p.src));
  const viaComponent = comps.filter((c) => usesIt(c.src));
  const hostingPages = all.filter(
    (p) => viaComponent.some((c) => new RegExp(`<${c.name}[\\s/>]`).test(p.src)),
  );

  const hosts = [...new Set([...direct, ...hostingPages])];
  return { hosts, roles: [...new Set(hosts.flatMap((h) => h.roles))].sort() };
}

describe('a permitted role that no page serves is declared, not silent', () => {
  const all = pages();

  it('found the pages and their gates at all', () => {
    // The floor this whole file rests on. Without it, a changed
    // `allowedRoles` spelling would make every capability below report "no
    // role is surfaced" and pass by declaring everything a known gap.
    expect(all.length).toBeGreaterThan(15);
    const gated = all.filter((p) => p.roles.length > 0);
    expect(gated.length).toBeGreaterThan(12);
    expect([...new Set(gated.flatMap((g) => g.roles))].sort())
      .toEqual(['admin', 'athlete', 'coach', 'executive', 'medical']);
  });

  const comps = components();

  it('found the component files too', () => {
    expect(comps.length).toBeGreaterThan(15);
  });

  it.each(CAPABILITIES.map((c) => [c.name, c]))('%s', (_name, cap) => {
    const permitted = endpointRoles(cap.routeFile, cap.roleConst);
    const { hosts, roles: surfaced } = surfacedRoles(all, comps, cap.endpoint);

    // Floor per capability: SOME page must reach this endpoint. If the
    // resolution stopped matching, `surfaced` would be empty and every
    // permitted role would look like a declared gap — the whole file would
    // pass while asserting nothing.
    expect(hosts.length).toBeGreaterThan(0);

    const unreachable = permitted.filter((r) => !surfaced.includes(r)).sort();
    const declared = Object.keys(cap.reachWithoutSurface).sort();

    // Both directions. An undeclared gap is the bug that reached Chapter 4; a
    // declared gap that no longer exists means somebody built the surface and
    // left a note saying they had not.
    expect(unreachable).toEqual(declared);
    declared.forEach((r) => {
      expect(ROLE_LABEL[r]).toBeDefined();
      expect(cap.reachWithoutSurface[r].length).toBeGreaterThan(40);
    });
  });

  // ── POSITIVE CONTROL ────────────────────────────────────────────────────
  //
  // Required by `guardCanaries.test.js`, which caught this file the moment it
  // was written: a scanner that enumerates a corpus and asserts its offender
  // list is empty is indistinguishable from one that cannot find an offender at
  // all. A corpus floor does not count — that proves the walk works, not the
  // detector.
  //
  // So the real resolver is run over a PLANTED corpus: an endpoint permitting
  // three roles, one page reaching it gated to one of them, and nothing
  // declared. The detector must name the two that cannot get there.
  it('canary — the detector reports a planted undeclared gap', () => {
    const fakePages = [
      { path: 'app/medical/dashboard/page.tsx', roles: ['medical'], src: "<Thing />" },
      { path: 'app/admin/settings/page.tsx', roles: ['admin'], src: '<Unrelated />' },
    ];
    const fakeComps = [
      { name: 'Thing', src: "const r = await api.get('/planted');" },
      { name: 'Unrelated', src: "api.get('/somewhere-else');" },
    ];

    const { hosts, roles } = surfacedRoles(fakePages, fakeComps, '/planted');
    // It resolved THROUGH the component to the page that renders it...
    expect(hosts.map((h) => h.path)).toEqual(['app/medical/dashboard/page.tsx']);
    expect(roles).toEqual(['medical']);

    // ...so against an endpoint permitting three, two are unreachable, which is
    // what an undeclared gap looks like before anybody writes a reason down.
    const permitted = ['medical', 'admin', 'coach'];
    const unreachable = permitted.filter((r) => !roles.includes(r)).sort();
    expect(unreachable).toEqual(['admin', 'coach']);

    // And the negative half: a page that reaches the endpoint DIRECTLY counts
    // too, or the watchlist (written inline, no component) would read as
    // unreachable by everybody.
    const direct = surfacedRoles(
      [{ path: 'app/coach/dashboard/page.tsx', roles: ['coach'], src: "api.get('/planted')" }],
      [],
      '/planted',
    );
    expect(direct.roles).toEqual(['coach']);
  });

  // The corrected row, pinned so it cannot drift back.
  it('Chapter 4 does not credit an administrator with the watchlist', () => {
    const table = fs.readFileSync(
      path.join(__dirname, '..', '..', 'docs', 'fyp', 'REPORT_TABLE_4-1.md'), 'utf8',
    );
    const line = table.split('\n').find((l) => l.includes('| Maintain a Personal Watchlist |'));
    expect(line).toBeDefined();
    const actors = line.split('|').filter(Boolean).pop().trim();
    expect(actors).toContain('Medical Staff');
    expect(actors).not.toContain('Administrator');
  });
});
