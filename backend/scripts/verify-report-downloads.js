// CAN EACH ROLE ACTUALLY DOWNLOAD THE REPORTS IT IS ENTITLED TO?
//
//   cd backend; npm run verify:reports              # against localhost
//   cd backend; npm run verify:reports -- --hosted  # against the deployed API
//
// WHY THIS EXISTS. From 2026-09-12 to 2026-10-05 every PDF report on the
// deployed instance answered 500, and nothing in this repo could see it.
//
//   `npx jest`           passes — the fonts resolve from a real node_modules
//   `npm run mutate`     passes — same reason
//   `npm run audit:access`  passes — it asserts WHO is refused, not what arrives
//   `npm run verify:claims --hosted`  10/10 — it probes JSON endpoints
//   `npm run e2e`        110/110 — it drives pages, and never downloads a file
//
// The cause was pdfkit 0.20 moving its standard-font metrics behind the package
// `exports` map, so Vercel's file tracer stopped bundling them (fixed by naming
// them in vercel.json's includeFiles). No check that reads SOURCE can see that,
// because the source is correct; it is a property of the deployed BUNDLE. The
// upgrade commit's own standard was "everything that can be SHOWN to still
// work", and pdfkit was shown to work — locally. This is the check that was
// missing from that sentence.
//
// A STATUS CODE IS NOT THE ANSWER, and that is the second reason this is its own
// script. These routes stream: startDoc() commits the response to being a PDF,
// so once drawing has begun `res.headersSent` is true and the catch can no
// longer answer 500 — it calls res.end(). A mid-draw failure arrives as HTTP 200
// with a file that may not open. So every check here asserts the %%EOF trailer
// pdfkit writes on end(), which is the only evidence the document was finished.
//
// PACED. A burst against the hosted API tripped Vercel's bot protection on
// 2026-09-11 and locked this machine out for ~20 minutes.
const args = process.argv.slice(2);
const HOSTED = args.includes('--hosted');
const at = args.indexOf('--url');
const API = at >= 0 ? args[at + 1]
  : (HOSTED ? 'https://airms-api.vercel.app/api' : (process.env.VERIFY_API || 'http://localhost:5000/api'));
// Loopback needs no pacing; the deployed API does.
const PACE = Number(process.env.VERIFY_PACE_MS || (API.includes('localhost') ? 0 : 1500));
const PASSWORD = process.env.VERIFY_PASSWORD || 'airms2026';

const { fetchPdf } = require('./lib/pdfResponse');

const sleep = (ms) => (ms ? new Promise((r) => { setTimeout(r, ms); }) : Promise.resolve());

const ACCOUNTS = {
  admin: 'admin@isn.gov.my',
  executive: 'executive@isn.gov.my',
  medical: 'medical@isn.gov.my',
  coach: 'coach@isn.gov.my',
  athlete: 'athlete@isn.gov.my',
};

// From the rbac lists in routes/screeningReports.js. Asserted in BOTH
// directions: a role missing from a list it should be on is a lost capability,
// and a role reaching a report it should not is a disclosure.
const ENTITLED = {
  holistic: ['admin', 'executive'],
  'programme-activity': ['admin', 'executive'],
  'activity-log': ['admin', 'executive'],
  team: ['medical', 'admin', 'coach', 'executive'],
  individual: ['athlete', 'medical', 'admin', 'coach', 'executive'],
};

async function login(email) {
  try {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!r.ok) return { err: `login ${r.status}` };
    const j = await r.json();
    return { token: j.token, user: j.user };
  } catch (e) {
    return { err: e.cause?.code || e.message };
  }
}

// What counts as a complete PDF lives in ONE place — see scripts/lib/pdfResponse.js
// for why the status code cannot answer this.
const pdf = (token, path) => fetchPdf(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });

/**
 * A roster athlete, and a COACH-VISIBLE one.
 *
 * The coach is sport-scoped and is NOT on /athletes' rbac list, so their squad
 * has to come from /coach/readiness. Handing a coach somebody else's athlete
 * produces a 403 that is entirely correct and reads exactly like a broken
 * capability — the first version of this probe did that and reported the scope
 * check working as two defects.
 */
async function subjects(sess) {
  const out = {};
  await sleep(PACE);
  const aj = await (await fetch(`${API}/athletes?limit=200`, {
    headers: { Authorization: `Bearer ${sess.admin.token}` },
  })).json().catch(() => null);
  const list = Array.isArray(aj) ? aj : (aj?.athletes || aj?.data || []);
  const first = list[0];
  if (first) out.any = { id: first._id || first.athleteId, sport: first.sport };

  if (sess.coach.token) {
    await sleep(PACE);
    const rd = await (await fetch(`${API}/coach/readiness`, {
      headers: { Authorization: `Bearer ${sess.coach.token}` },
    })).json().catch(() => null);
    const rows = rd?.athletes || rd?.squad || rd?.rows || (Array.isArray(rd) ? rd : []);
    if (rows[0]) out.coach = { id: rows[0]._id || rows[0].athleteId, sport: rows[0].sport || rd?.sport };
  }

  // The athlete account may only pull its OWN record.
  const u = sess.athlete.user;
  if (u && u.athleteId) out.athlete = { id: u.athleteId, sport: null };
  return out;
}

async function main() {
  console.log(`target: ${API}${PACE ? `  (paced ${PACE}ms)` : ''}\n`);

  const sess = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    await sleep(PACE);
    sess[role] = await login(email);
    if (sess[role].err) console.log(`  login ${role.padEnd(10)} ${sess[role].err}`);
  }
  const noSession = Object.entries(sess).filter(([, s]) => !s.token).map(([r]) => r);
  if (noSession.length === Object.keys(ACCOUNTS).length) {
    console.error('  could not sign in as any role — is the server up, and is the database seeded?');
    process.exit(2);
  }

  const subj = await subjects(sess);
  if (!subj.any) { console.error('  no roster athlete to report on — is the database seeded?'); process.exit(2); }
  console.log(`  subject: ${subj.any.id} (${subj.any.sport})`);
  if (subj.coach) console.log(`  coach's own squad: ${subj.coach.id} (${subj.coach.sport})`);
  if (subj.athlete) console.log(`  athlete's own record: ${subj.athlete.id}`);

  // For each role, the id and sport it is ENTITLED to ask about. Using the
  // wrong one tests the scope check rather than the report.
  const forRole = (role) => (role === 'coach' ? (subj.coach || subj.any)
    : (role === 'athlete' ? (subj.athlete || subj.any) : subj.any));

  const checks = [];
  for (const kind of Object.keys(ENTITLED)) {
    for (const role of Object.keys(ACCOUNTS)) {
      if (!sess[role].token) continue;
      const s = forRole(role);
      let path;
      if (kind === 'individual') path = `/screening-reports/individual/${s.id}.pdf`;
      else if (kind === 'team') path = `/screening-reports/team.pdf?sport=${encodeURIComponent(s.sport || subj.any.sport)}`;
      else path = `/screening-reports/${kind}.pdf`;
      checks.push({ kind, role, path, allowed: ENTITLED[kind].includes(role) });
    }
  }

  const fails = [];
  let last = null;
  for (const c of checks) {
    if (c.kind !== last) { console.log(`\n${c.kind}.pdf`); last = c.kind; }
    await sleep(PACE);
    const r = await pdf(sess[c.role].token, c.path);
    let verdict;
    if (r.delivered && r.complete) {
      verdict = `complete PDF, ${r.note}`;
      if (!c.allowed) { verdict += '   *** SHOULD HAVE BEEN REFUSED'; fails.push(`${c.kind}: delivered to ${c.role}, which is not on its rbac list`); }
    } else if (r.delivered) {
      verdict = `*** ${r.note}`;
      fails.push(`${c.kind}/${c.role}: HTTP ${r.status} over an incomplete document`);
    } else if (c.allowed) {
      verdict = `*** ${r.note}`;
      fails.push(`${c.kind}/${c.role}: ${r.status} — ${r.note}`);
    } else {
      verdict = 'refused (correct)';
    }
    console.log(`  ${c.role.padEnd(10)} ${String(r.status).padEnd(4)} ${verdict}`);
  }

  console.log(`\n${'='.repeat(64)}`);
  if (noSession.length) console.log(`note: could not sign in as ${noSession.join(', ')} — those rows were skipped, not passed.`);
  if (!fails.length) {
    console.log(`${checks.length}/${checks.length} — every role that should get each report got a complete PDF,`);
    console.log('and every role that should not was refused.');
    process.exit(0);
  }
  console.log(`${fails.length} of ${checks.length} checks FAILED:`);
  for (const f of fails) console.log(`  - ${f}`);
  console.log('');
  console.log('If every PDF route failed while JSON endpoints are healthy, suspect the');
  console.log("BUNDLE before the code: pdfkit's font metrics must be named in");
  console.log('backend/vercel.json includeFiles, or the tracer leaves them out.');
  process.exit(1);
}

// RUNS ONLY WHEN INVOKED DIRECTLY, so tests/reportDownloadMatrix.test.js can
// import ENTITLED and pin it against the route file's rbac lists. The same rule
// seeder.js follows: a `require()` of this must be inert, or importing it to
// check one constant would start probing a live API.
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(2); });
}

module.exports = { ENTITLED, ACCOUNTS };
