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
