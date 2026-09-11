// Check the OPERATIONAL claims this system makes, against a running instance.
//
//   cd backend; npm run verify:claims                 # local (needs npm run dev)
//   cd backend; npm run verify:claims -- --hosted     # the deployed API
//   cd backend; npm run verify:claims -- --url https://…/api
//
// WHY THIS EXISTS.
//
// The rest of the project's guards check properties of the CODE: jest asserts
// functions, `npm run map` regenerates the inventory, `npm run mutate` proves a
// guard can fail, `npm run audit:access` calls every endpoint as every role.
// All of them run against the source or a local process.
//
// A whole class of claim is invisible to every one of them, because it is only
// true or false of a DEPLOYED system. SILENT_FAILURES 3r is the worked example:
// the login throttle was configured to count failures, its own RateLimit header
// said it counted failures, every unit test passed — and on the serverless host
// it counted successes for weeks, because the un-counting ran after the response
// and the instance was frozen by then. No amount of reading the code would have
// said so. One request did.
//
// So this asks the running system, and prints the number it got rather than a
// tick. A claim you cannot re-measure in front of someone is a claim you are
// asking them to take on trust.
//
// PACED ON PURPOSE. Verifying a rate limiter by hammering the host is how this
// machine tripped Vercel's bot protection on 2026-09-11 and locked itself out
// of the API for twenty minutes. Every request here is spaced, and the whole run
// is a few dozen calls.
//
// READ-MOSTLY. The only state it changes is: failed login attempts (which the
// run then clears by signing in successfully — that IS one of the claims), and
// one `athlete.view` audit row, which is the ordinary consequence of opening a
// record and the thing being checked.

const PACE_MS = Number(process.env.VERIFY_PACE_MS || 700);
const PW = process.env.VERIFY_PW || 'airms2026';

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const API = urlArg >= 0 ? args[urlArg + 1]
  : args.includes('--hosted') ? 'https://airms-api.vercel.app/api'
    : 'http://localhost:5000/api';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const results = [];
function claim(name, ok, measured, note = '') {
  results.push({ name, ok, measured, note });
  const tag = ok === null ? 'SKIP' : ok ? 'ok  ' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`  ${tag}  ${name}\n        measured: ${measured}${note ? `\n        ${note}` : ''}`);
}

async function call(path, { method = 'GET', token = null, body = null } = {}) {
  await sleep(PACE_MS);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json — a challenge page, say */ }
  return {
    status: res.status,
    json,
    text,
    rateLimit: res.headers.get('ratelimit'),
    mitigated: res.headers.get('x-vercel-mitigated'),
  };
}

const remainingOf = (h) => (h ? Number((h.match(/remaining=(\d+)/) || [])[1]) : null);

const login = async (email, password = PW) =>
  call('/auth/login', { method: 'POST', body: { email, password } });

(async () => {
  // eslint-disable-next-line no-console
  console.log(`\nverifying claims against ${API}\n`);

  const health = await call('/health');
  if (health.mitigated) {
    // eslint-disable-next-line no-console
    console.error(
      `The host is challenging this client (x-vercel-mitigated: ${health.mitigated}).\n`
      + 'That is bot protection reacting to request volume, not an outage — wait a\n'
      + 'few minutes and re-run. Do not retry in a loop; that sustains it.',
    );
    process.exit(2);
  }
  if (health.status !== 200) {
    // eslint-disable-next-line no-console
    console.error(`API not reachable: /health -> ${health.status}. Is \`npm run dev\` running?`);
    process.exit(2);
  }

  const admin = (await login('admin@isn.gov.my')).json?.token;
  const medical = (await login('medical@isn.gov.my')).json?.token;
  const coach = (await login('coach@isn.gov.my')).json?.token;
  if (!admin || !medical || !coach) {
    // eslint-disable-next-line no-console
    console.error('Could not sign in as admin/medical/coach. Is the database seeded?');
    process.exit(2);
  }

  // ── 1. The login throttle counts FAILURES, not requests ──────────────────
  //
  // SILENT_FAILURES 3r. The header said "failures" while the deployed limiter
  // counted every request, so a clinic behind one address could lock itself out
  // with correct passwords.
  //
  // Local runs skip this: 127.0.0.1 is exempt from the limiter by design, so
  // there is no counter to read and a green tick here would be meaningless.
  // eslint-disable-next-line no-console
  console.log('\n1. the login throttle');
  const bad1 = await login('admin@isn.gov.my', 'definitely-not-the-password');
  const isLocal = bad1.rateLimit === null;

  if (isLocal) {
    claim('counts failures, and a success forgives them', null,
      'not measurable locally',
      'loopback is exempt from the limiter (by design), so no counter exists. Run with --hosted.');
  } else {
    const bad2 = await login('admin@isn.gov.my', 'definitely-not-the-password');
    const r1 = remainingOf(bad1.rateLimit);
    const r2 = remainingOf(bad2.rateLimit);
    claim('a failed sign-in consumes budget', r2 < r1,
      `remaining ${r1} -> ${r2}`);

    const good = await login('admin@isn.gov.my');
    const after = await login('admin@isn.gov.my', 'definitely-not-the-password');
    const rAfter = remainingOf(after.rateLimit);
    claim('a SUCCESSFUL sign-in forgives the failures before it',
      good.status === 200 && rAfter !== null && rAfter >= r1,
      `after a success, the next request starts from remaining=${rAfter} (was ${r2})`);
  }

  // ── 2. Using the system does not spend the login budget ──────────────────
  //
  // The half that was worse: /auth/me runs on every page mount, so ~30 page
  // views locked a clinician out of their own session.
  // eslint-disable-next-line no-console
  console.log('\n2. ordinary navigation is outside the throttle');
  const me = await call('/auth/me', { token: medical });
  claim('GET /auth/me is not rate-limited',
    me.status === 200 && me.rateLimit === null,
    `status ${me.status}, RateLimit header ${me.rateLimit === null ? 'absent' : `present (${me.rateLimit})`}`);

  // ── 3. Reading a clinical record is logged, ON THIS HOST ─────────────────
  //
  // §51 leans on this: medical staff are unscoped because reading is audited.
  // The write is fire-and-forget, which is the 3r shape — so it is checked
  // where it has to be true rather than assumed from the source.
  // eslint-disable-next-line no-console
  console.log('\n3. the audit trail');
  const roster = await call('/athletes?limit=1', { token: medical });
  const first = (roster.json?.athletes || roster.json?.data || roster.json || [])[0];
  const athleteId = first && (first.athleteId || first._id);
  if (!athleteId) {
    claim('an athlete.view row is written when a record is opened', false, 'no athlete on the roster to open');
  } else {
    const before = await call('/audit?action=athlete.view&limit=1', { token: admin });
    const n0 = before.json?.total ?? null;
    await call(`/athletes/${athleteId}`, { token: medical });
    await sleep(2500); // the write is not awaited by the response; give it room
    const after = await call('/audit?action=athlete.view&limit=1', { token: admin });
    const n1 = after.json?.total ?? null;
    claim('an athlete.view row is written when a record is opened',
      n0 !== null && n1 !== null && n1 > n0,
      `athlete.view rows ${n0} -> ${n1}`,
      'fire-and-forget, but STARTED during the handler — which is why it survives a frozen instance');
  }

  // ── 4. "Since you last looked" is honoured, bounded, and fails safe ───────
  // eslint-disable-next-line no-console
  console.log('\n4. the caller-held change marker');
  const windowOnly = await call('/decisions', { token: medical });
  const withSince = await call(`/decisions?since=${encodeURIComponent(new Date(Date.now() - 30 * 864e5).toISOString())}`, { token: medical });
  const garbage = await call('/decisions?since=not-a-date', { token: medical });
  const ancient = await call('/decisions?since=2000-01-01T00:00:00.000Z', { token: medical });
  const future = await call(`/decisions?since=${encodeURIComponent(new Date(Date.now() + 5 * 864e5).toISOString())}`, { token: medical });

  claim('a marker is honoured and reaches further back than the window',
    withSince.json?.changesBasis === 'since'
      && (withSince.json?.changes?.length ?? 0) >= (windowOnly.json?.changes?.length ?? 0),
    `window: ${windowOnly.json?.changes?.length} changes (basis ${windowOnly.json?.changesBasis})`
    + ` · 30-day marker: ${withSince.json?.changes?.length} (basis ${withSince.json?.changesBasis})`);

  claim('a corrupt marker falls back to the window instead of emptying the panel',
    garbage.json?.changesBasis === 'window',
    `basis ${garbage.json?.changesBasis}`);

  claim('a stale marker is clamped, and says so',
    ancient.json?.changesBasis === 'clamped',
    `basis ${ancient.json?.changesBasis}, from ${ancient.json?.changesFrom}`);

  claim('a FUTURE marker (wrong clock) cannot hide a change',
    future.json?.changesBasis === 'window',
    `basis ${future.json?.changesBasis}`,
    'trusting it would put the cutoff past every real screening and report "nothing moved"');

  // ── 5. The read-only role gets the feature, and still cannot write ────────
  //
  // MASTER_CLARIFICATIONS §12. The marker lives in the browser precisely so
  // that coach is not excluded; that only counts if the write is still refused.
  // eslint-disable-next-line no-console
  console.log('\n5. coach is read-only, and not second-class');
  const coachView = await call(`/decisions?since=${encodeURIComponent(new Date(Date.now() - 60 * 864e5).toISOString())}`, { token: coach });
  claim('a coach gets a real "since you last looked"',
    coachView.status === 200 && coachView.json?.changesBasis !== 'window',
    `scope ${coachView.json?.scope}, basis ${coachView.json?.changesBasis},`
    + ` ${coachView.json?.changes?.length} changes, canMarkReviewed=${coachView.json?.canMarkReviewed}`);

  const coachWrite = await call(`/decisions/reviewed/${athleteId || 'x'}`, {
    method: 'POST', token: coach, body: { screeningId: 1 },
  });
  claim('a coach still cannot write', coachWrite.status === 403, `POST -> ${coachWrite.status}`);

  // ── summary ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.ok === false);
  const skipped = results.filter((r) => r.ok === null);
  // eslint-disable-next-line no-console
  console.log(
    `\n${results.length - skipped.length - failed.length}/${results.length - skipped.length} claims verified`
    + `${skipped.length ? `, ${skipped.length} not measurable here` : ''}`
    + `${failed.length ? `, ${failed.length} FAILED` : ''}\n`,
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(`verify:claims could not run: ${e.message}`);
  process.exit(2);
});
