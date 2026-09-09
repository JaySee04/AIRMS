// Call every endpoint as every non-admin role and print what each may do.
//
//   npm run dev                    # in another terminal
//   cd backend; npm run audit:access
//
// WHY THIS IS A SCRIPT AND NOT A TEST
//
// It needs a running server and a seeded database, so it cannot live in jest
// alongside the pure-logic suites. It exists because reading `rbac()` calls
// tells you what was INTENDED; calling the endpoints tells you what is true.
// Run on 2026-09-02 it found the role model sound and two disclosures beneath
// it — a coach able to tell a real IC number from an invented one, and the
// clinician's injury note on coach and executive payloads. Neither was visible
// on any screen (DESIGN_DECISIONS §43).
//
// WHAT A HEALTHY RUN LOOKS LIKE
//
//   * every write refused for coach, executive and athlete
//   * executive with no write reach anywhere
//   * coach and athlete refused every athlete outside their scope
//   * scoped refusals identical for an unknown id and a forbidden one, so an
//     IC number cannot be tested for roster membership
//
// Writes are aimed at a deliberately invalid id, so a role that IS allowed
// through hits "not found" in the handler rather than changing anything. The
// few writes with no id are probed only for roles that must be refused: a 403
// costs nothing, and a 2xx there would be the finding that justified the call.
const BASE = process.env.AUDIT_API || 'http://localhost:5000/api';
const PW = process.env.AUDIT_PW || 'airms2026';
const BOGUS = '__nope__';

const ACCOUNTS = {
  medical: 'medical@isn.gov.my',
  coach: 'coach@isn.gov.my',
  executive: 'executive@isn.gov.my',
  athlete: 'athlete@isn.gov.my',
  admin: 'admin@isn.gov.my',
};
const ROLES = ['medical', 'coach', 'executive', 'athlete'];

// Endpoints deliberately outside this audit, each with the reason. This is a
// ROLE-boundary audit; these routes have no role boundary to test.
//
// Kept as an explicit list rather than a pattern, so adding one is a decision
// somebody makes rather than a silence somebody inherits.
const EXEMPT = new Map([
  // Unauthenticated by design — they are how a session is obtained, and every
  // role reaches them because nobody is a role yet.
  ['POST /api/auth/login', 'unauthenticated by design'],
  ['POST /api/auth/forgot-password', 'unauthenticated by design'],
  ['POST /api/auth/verify-otp', 'unauthenticated by design'],
  ['POST /api/auth/reset-password', 'unauthenticated by design'],
  // Self-scoped: no id in the path, addresses req.user only. Every role may
  // read and write its OWN, which is the point (see routes/auth.js).
  ['POST /api/auth/change-password', 'self-scoped, no role boundary'],
  ['GET /api/auth/notification-preferences', 'self-scoped, no role boundary'],
  ['PUT /api/auth/notification-preferences', 'self-scoped, no role boundary'],
]);

// The route table, read from the parser that generates docs/SYSTEM_MAP.md.
// One definition of "what endpoints exist", shared with the map.
const { routes: declaredRoutes } = require('./system-map');

// Normalise both sides to `VERB /api/path/:p`: the probe list uses concrete
// ids, {SELF}/{OTHER} placeholders and query strings; the map uses :params.
// NOTE the template-literal probes (`/athletes/${BOGUS}/injury`) are already
// EVALUATED by the time this runs, so the sentinel and any concrete id have to
// be normalised by value, not by syntax. Missing that reported 22 endpoints as
// unprobed on the first run when most of them are probed carefully.
const ID_SEGMENT = new RegExp(
  '/(?:' + [
    BOGUS,                    // the deliberate not-found id
    '\\{[A-Z_]+\\}',          // {SELF} / {OTHER} placeholders
    '\\d{3,}',                // numeric ids and IC numbers
    'digest', 'rescreen_reminder', // concrete :kind values for the mail route
  // Lookahead allows a FILE EXTENSION after the id: the individual report is
  // probed as `/screening-reports/individual/{SELF}.pdf` and declared as
  // `/individual/:id.pdf`. Anchoring on `/` alone left that pair unmatched and
  // reported a carefully-probed route as a coverage gap.
  ].join('|') + ')(?=[./]|$)',
  'g',
);

function key(method, p) {
  const path = (p.startsWith('/api') ? p : `/api${p}`)
    .split('?')[0]
    .replace(ID_SEGMENT, '/:p')
    .replace(/:[A-Za-z]+/g, ':p')
    .replace(/\/$/, '');
  return `${method} ${path}`;
}

// Endpoints the parser found that no probe and no exemption accounts for.
function coverageGap() {
  const probed = new Set(ROUTES.map(([m, p]) => key(m, p)));
  const exempt = new Set([...EXEMPT.keys()].map((k) => {
    const [m, ...rest] = k.split(' ');
    return key(m, rest.join(' '));
  }));
  return declaredRoutes()
    .map((r) => key(r.method, r.path))
    .filter((k, i, a) => a.indexOf(k) === i)
    .filter((k) => !probed.has(k) && !exempt.has(k))
    .sort();
}

// [method, path, body?, onlyProbeTheseRoles?]
const ROUTES = [
  ['GET', '/auth/me'],
  ['GET', '/screenings/reliability'],
  ['GET', '/athletes'],
  ['GET', '/athletes/meta/sports'],
  ['GET', '/athletes/analytics/screening'],
  ['GET', '/athletes/analytics/periods'],
  ['GET', '/athletes/teammates'],
  ['GET', '/audit'],
  ['GET', '/audit/staff'],
  // The personal watchlist. A WRITE, but to the caller's own preference
  // rather than to institutional data - the same shape as a notification
  // opt-out. medical and admin ONLY: coach was removed after this very audit
  // flagged it, because coach is read-only by a locked decision and the
  // property worth keeping is that no read-only role completes ANY write.
  // Probed for every role so the matrix shows the refusals.
  ['GET', '/watchlist'],
  ['POST', '/watchlist/__nope__', {}],
  ['DELETE', '/watchlist/__nope__', null],
  ['GET', '/coach/readiness'],
  ['GET', '/cohorts'],
  ['GET', '/cohorts/versions'],
  ['GET', '/cohorts/settings/all'],
  ['GET', '/isn/athletes'],
  ['GET', '/upload/screening/pdf/status'],
  ['GET', '/export/backup.xlsx'],
  ['GET', '/screening-reports/holistic.pdf'],
  ['GET', '/screening-reports/programme-activity.pdf'],
  ['GET', '/screening-reports/activity-log.pdf'],
  ['GET', '/users?role=medical'],
  ['GET', '/athletes/{SELF}'],
  ['GET', '/athletes/{OTHER}'],
  ['GET', '/screenings/athlete/{SELF}'],
  ['GET', '/screenings/athlete/{OTHER}'],
  ['GET', '/screening-reports/individual/{SELF}.pdf'],
  ['GET', '/screening-reports/individual/{OTHER}.pdf'],
  ['GET', '/screening-reports/team.pdf?sport={MYSPORT}'],
  ['GET', '/screening-reports/team.pdf?sport={OTHERSPORT}'],
  // ── Added 2026-09-09, when the coverage check below was introduced and found
  // these ten had never been probed at all. Two of them are routes
  // DESIGN_DECISIONS §43/§51 reason about explicitly — the scoped record
  // lookup, and the raw screening executive is deliberately refused — so the
  // matrix was silent on precisely the access decisions the project argues.
  ['GET', '/screenings/{SELF}/full'],
  ['GET', '/screenings/{OTHER}/full'],
  ['GET', '/athletes/{OTHER}/sport-context'],
  ['GET', '/athletes/meta/disciplines'],
  ['GET', '/cohorts/999/members'],
  ['GET', '/isn/athletes/000000000000'],
  ['GET', '/users/permission-meta'],
  // Norm-governance writes. All three were unprobed, which meant no role was
  // ever tested against the controls that move the norms every athlete is
  // scored against.
  ['POST', '/cohorts/versions', { name: 'audit probe' }],
  ['PATCH', `/cohorts/versions/${BOGUS}`, { name: 'audit probe' }],
  ['POST', `/cohorts/versions/${BOGUS}/restore`, {}],
  // The import PREVIEW. The commit step was probed and this was not, though it
  // is the half that spends vision-provider tokens.
  ['POST', '/upload/screening/pdf/preview', {}],

  ['PATCH', `/athletes/${BOGUS}`, { name: 'x' }],
  ['DELETE', `/athletes/${BOGUS}`],
  ['PATCH', `/athletes/${BOGUS}/injury`, { isInjured: false }],
  ['PATCH', `/screenings/${BOGUS}/override`, { band: 'green', note: 'audit' }],
  ['POST', `/screenings/${BOGUS}/reinstate`, {}],
  ['PATCH', `/cohorts/${BOGUS}`, {}],
  ['PATCH', `/cohorts/members/${BOGUS}`, {}],
  ['POST', `/cohorts/versions/${BOGUS}/pin`, {}],
  ['DELETE', `/cohorts/versions/${BOGUS}`],
  ['PATCH', `/users/${BOGUS}`, { isActive: true }],
  ['POST', `/users/${BOGUS}/invite`, {}],
  ['POST', '/athletes', {}, ROLES],
  ['POST', '/cohorts/recompute', {}, ['coach', 'executive', 'athlete']],
  ['POST', '/cohorts/versions/unpin', {}, ROLES],
  ['PATCH', '/cohorts/settings/all', {}, ROLES],
  ['POST', '/cohorts/settings/mail/digest/send-now', {}, ROLES],
  ['POST', '/upload/screening/pdf', {}, ['coach', 'executive', 'athlete']],
  ['POST', '/users', {}, ROLES],
];

const isWrite = (m) => m !== 'GET';

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}. Is the backend running and seeded?`);
  return r.json();
}

(async () => {
  const sessions = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) sessions[role] = await login(email);
  const adminTok = sessions.admin.token;
  const H = { Authorization: `Bearer ${adminTok}` };

  const coachRows = await (await fetch(`${BASE}/users?role=coach`, { headers: H })).json();
  const coachSport = (coachRows.find((c) => c.email === ACCOUNTS.coach) || {}).coachSport;
  const roster = await (await fetch(`${BASE}/athletes`, { headers: H })).json();
  const mine = roster.find((a) => a.sport === coachSport);
  const other = roster.find((a) => a.sport && a.sport !== coachSport);
  const selfAthlete = sessions.athlete.user.athleteId;

  const subst = (p, role) => p
    .replace('{SELF}', role === 'athlete' ? selfAthlete : mine.athleteId)
    .replace('{OTHER}', other.athleteId)
    .replace('{MYSPORT}', encodeURIComponent(coachSport))
    .replace('{OTHERSPORT}', encodeURIComponent(other.sport));

  console.log(`roster ${roster.length} · coach sport ${coachSport}\n`);
  console.log('endpoint'.padEnd(48) + ROLES.map((r) => r.padStart(10)).join(''));
  console.log('-'.repeat(48 + 10 * ROLES.length));

  const violations = [];
  for (const [method, rawPath, body, only] of ROUTES) {
    const cells = [];
    for (const role of ROLES) {
      if (only && !only.includes(role)) { cells.push('-'); continue; }
      const res = await fetch(BASE + subst(rawPath, role), {
        method,
        headers: {
          Authorization: `Bearer ${sessions[role].token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const ok = res.status >= 200 && res.status < 300;
      cells.push(ok ? 'OK' : String(res.status));
      // A read-only role must be REFUSED, not merely unsuccessful.
      //
      // Checking only for a 2xx would miss almost everything: the write probes
      // carry a deliberately invalid id, so a role that RBAC waved through still
      // ends at 404 in the handler. A 404 means the request got past the guard
      // and only the missing row stopped it — which on a real id would have been
      // a write. So anything other than a refusal is the finding.
      if (isWrite(method) && role !== 'medical' && res.status !== 403 && res.status !== 401) {
        violations.push(`${role} reached ${method} ${rawPath} — expected 403, got ${res.status}`);
      }
    }
    console.log(`${method} ${rawPath}`.slice(0, 46).padEnd(48) + cells.map((c) => c.padStart(10)).join(''));
  }

  console.log('');

  // ── Is this audit still complete? ────────────────────────────────────────
  //
  // Added 2026-09-09. ROUTES above is HAND-MAINTAINED, and it had drifted: the
  // docs described this script as calling "all 49 endpoints" while the system
  // had grown to 62. A permission matrix that silently covers less of the
  // surface than it claims is the project's own recurring defect class — a
  // guard that looks complete and is not.
  //
  // The route table is now read from the SAME parser that generates
  // docs/SYSTEM_MAP.md, so "what exists" has one definition and this list
  // cannot fall behind it again without saying so.
  const uncovered = coverageGap();
  if (uncovered.length) {
    console.error(`${uncovered.length} ENDPOINT(S) EXIST BUT ARE NEVER PROBED:`);
    uncovered.forEach((e) => console.error(`  ${e}`));
    console.error('');
    console.error('Add a probe to ROUTES, or add it to EXEMPT with the reason.');
    console.error('An unprobed endpoint is one this matrix makes no claim about.');
    process.exit(1);
  }
  console.log(`coverage: every endpoint in the route table is probed.`);

  if (violations.length) {
    console.error(`${violations.length} WRITE REACHED BY A READ-ONLY ROLE:`);
    violations.forEach((v) => console.error(`  ${v}`));
    process.exit(1);
  }
  console.log('no read-only role completed a write.');
  console.log('Compare the matrix against DESIGN_DECISIONS §43 before concluding it is unchanged.');
  process.exit(0);
})().catch((e) => {
  // The cause matters. "fetch failed" alone cannot tell a stopped server from a
  // wrong URL from a DNS quirk, and this script is meant to be runnable by
  // somebody who has not read it.
  const cause = e && e.cause ? ` (${e.cause.code || e.cause.message})` : '';
  console.error(`\n${e.message}${cause}`);
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  console.error('\nIs the backend running (npm run dev) and the database seeded?');
  process.exit(2);
});
