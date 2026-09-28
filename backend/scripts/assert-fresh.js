// REFUSE TO MEASURE A BUILD THAT IS NOT THE CODE YOU ARE READING.
//
// Every probe in this repo — verify:claims, audit:access, e2e — asks a RUNNING
// instance a question and reports the answer as a fact about the source. That
// inference is unexamined, and it has been wrong twice in one day:
//
//   §113  the hosted API was broken for six days. Probes reasoned from the
//         working tree ("INDICATOR_ATTRS names those columns") about a deployed
//         build that predated them. Every conclusion was confidently wrong.
//   §116.5  a restart failed on a port the old server still held, so an "after"
//         measurement came from the "before" build and reported no change.
//
// Neither was a hard failure. Both produced a plausible number, which is this
// project's defect class exactly (docs/SILENT_FAILURES.md): a wrong answer that
// looks like a right one.
//
// So: the server reports `build` on /api/health (utils/buildId.js) and this
// compares it against the tree the script is running from. Loud, and exits
// non-zero, because the point is to stop a measurement being taken rather than
// to annotate it afterwards.
//
// DELIBERATELY NOT FATAL BY DEFAULT WHEN IT CANNOT TELL. A server that predates
// this field, or one reporting `unknown`, gets a WARNING and the probe
// continues — the hosted instance is exactly such a server until the next
// deploy, and a check that bricked every existing workflow on the day it landed
// would be removed within the week. `--strict` turns that into a refusal, which
// is what CI should use once the field is everywhere.
const path = require('path');

const { buildId } = require(path.join(__dirname, '..', 'src', 'utils', 'buildId'));

/**
 * Compare a running instance's build against this working tree.
 *
 * @param {string} apiBase e.g. http://localhost:5000/api
 * @returns {Promise<{ok:boolean, reason:string, local:string, remote:string|null}>}
 */
async function checkFresh(apiBase) {
  const local = buildId();
  let remote = null;
  try {
    const r = await fetch(`${apiBase.replace(/\/$/, '')}/health`);
    const body = await r.json().catch(() => ({}));
    remote = typeof body.build === 'string' ? body.build : null;
  } catch (e) {
    return { ok: false, reason: `unreachable: ${e.message}`, local, remote: null };
  }
  if (!remote) return { ok: true, reason: 'no-build-field', local, remote: null };
  if (remote === 'unknown') return { ok: true, reason: 'server-could-not-fingerprint', local, remote };
  if (remote !== local) return { ok: false, reason: 'stale', local, remote };
  return { ok: true, reason: 'match', local, remote };
}

/** Print the verdict. Returns the exit code the caller should use. */
function report(res, { strict = false, label = 'instance' } = {}) {
  if (res.reason === 'match') {
    console.log(`  build ${res.local} — ${label} is running this working tree`);
    return 0;
  }
  if (res.reason === 'stale') {
    console.error('');
    console.error(`  REFUSING TO MEASURE: the ${label} is running a DIFFERENT build.`);
    console.error(`    this working tree : ${res.local}`);
    console.error(`    the ${label.padEnd(14)}: ${res.remote}`);
    console.error('');
    console.error('  Anything measured now describes code you are not reading.');
    console.error('  Restart the server (npm run dev:stop, then npm run dev), or deploy,');
    console.error('  and check nothing else is holding the port — a failed restart leaves');
    console.error('  the OLD server answering, which is how this was found (DD 116.5).');
    return 1;
  }
  if (res.reason === 'unreachable') {
    console.error(`  cannot reach the ${label}: ${res.reason}`);
    return 1;
  }
  // Cannot tell.
  const msg = res.reason === 'no-build-field'
    ? `the ${label} predates the build fingerprint, so freshness CANNOT be checked`
    : `the ${label} could not fingerprint its own source (${res.remote})`;
  console.error(`  ${strict ? 'REFUSING' : 'WARNING'}: ${msg}.`);
  if (!strict) console.error('    Continuing — but treat what follows as unverified.');
  return strict ? 1 : 0;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--url');
  const base = at >= 0 ? args[at + 1] : (process.env.VERIFY_API || 'http://localhost:5000/api');
  const strict = args.includes('--strict');
  checkFresh(base)
    .then((res) => process.exit(report(res, { strict, label: base.includes('localhost') ? 'server' : 'deployed API' })))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { checkFresh, report };
