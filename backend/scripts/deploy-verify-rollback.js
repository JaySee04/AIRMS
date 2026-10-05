// DEPLOY, VERIFY, AND ROLL BACK BY ITSELF IF THE DEPLOY IS BAD.
//
//   cd backend; node scripts/deploy-verify-rollback.js --yes
//
// WHY THIS EXISTS. The deploy of this branch carries one risk that cannot be
// eliminated from here: `screenings.norm_version_id` and `scored_at` may not
// exist on the hosted Aiven database. Nobody can tell from outside — §121.11
// tried three client-side probes and every one was confounded — and the
// credentials needed to ask `information_schema` are redacted by Vercel on
// pull (21 of 43 values come back as `[SENSITIVE]`), so `verify:schema --url`
// is not available without the connection string from the Aiven console.
//
// If those columns are missing, the new build's exclude-form query names them,
// and GET /athletes/:id, /screenings/:id/full and /decisions answer 500. That is
// §113 exactly.
//
// WHAT WAS CONSIDERED AND REJECTED. The read path could be made tolerant —
// utils/cohorts.js uses `attributes: { exclude: [...] }`, which makes Sequelize
// name every OTHER column, and nothing actually reads normVersionId/scoredAt off
// those results. Converting it to an explicit list would make the deploy immune.
// It was rejected deliberately: a missing attribute is a SILENT undefined across
// every dashboard, while a missing column is a LOUD 500. Trading a loud failure
// for a quiet one is the wrong direction in this codebase, and §113 was only
// damaging because it went unnoticed for six days — not because it was subtle.
//
// So the risk is not removed, it is made SELF-CORRECTING. §113 lasted six days
// because recovery depended on somebody looking. Here recovery is part of the
// deploy.
//
// WHAT IT DOES
//   1. refuses unless the working tree is clean and the merge is ready;
//   2. records the current production SHA — the rollback point;
//   3. pushes the merge, which is what Vercel builds from;
//   4. waits for the new build to actually be serving. This is possible only
//      because the new code carries §117's build fingerprint: /api/health
//      reports `build`, and the OLD build does not report it at all. So "has the
//      deploy landed" is observed rather than guessed at with a sleep;
//   5. verifies the three §113 endpoints;
//   6. on any 5xx, pushes the recorded SHA back and re-verifies the restore.
//
// EXIT CODES  0 deployed and verified · 1 deployed, failed, ROLLED BACK
//             · 2 refused to start, or the rollback itself failed
const { execFileSync } = require('child_process');
const path = require('path');

const { fetchPdf } = require('./lib/pdfResponse');

const API = process.env.DEPLOY_API || 'https://airms-api.vercel.app/api';
const BRANCH = process.env.DEPLOY_BRANCH || 'feat/mysql-migration';
const SOURCE = process.env.DEPLOY_SOURCE || 'deploy-staging';
const ROOT = path.join(__dirname, '..', '..');
const CONFIRMED = process.argv.includes('--yes');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const log = (s) => console.log(s);

async function probe(token, p) {
  try {
    const r = await fetch(`${API}${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return r.status;
  } catch (e) {
    return `ERR ${e.cause?.code || e.message}`;
  }
}

async function session() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@isn.gov.my', password: 'airms2026' }),
  });
  if (!r.ok) return null;
  return (await r.json()).token;
}

/**
 * Download something that must be a PDF, and say whether a COMPLETE one arrived.
 *
 * A STATUS CODE CANNOT ANSWER THIS, which is the whole reason this exists
 * separately from probe(). The report routes stream: startDoc() commits the
 * response to being a PDF, so once drawing has begun `res.headersSent` is true
 * and the catch can no longer answer 500 — it calls res.end(). A mid-draw
 * failure therefore arrives as HTTP 200 with a .pdf that may not open, and a
 * deploy check that only read statuses would wave it through. So this asserts
 * the %%EOF trailer pdfkit writes on end(), which is the only evidence the
 * document was finished rather than cut off.
 */
async function pdfProbe(token, p) {
  const r = await fetchPdf(`${API}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  return {
    status: r.status,
    ok: r.complete,
    note: r.complete ? `complete PDF, ${r.note}` : `*** ${r.note}`,
  };
}

/**
 * The three §113 endpoints, the roster as a control, and every report download.
 *
 * THE REPORTS ARE HERE BECAUSE NOTHING WAS WATCHING THEM. On 2026-10-05 all
 * five answered 500 on the deployed instance for every role entitled to them,
 * and `GET /audit?action=report.download` returned a count of ZERO — so no
 * report had ever been delivered by this deployment, while verify:claims
 * reported 10/10 and hosted e2e reported 110/110. Both were right about what
 * they cover; neither downloads a document. The cause was pdfkit's font metrics
 * being traced out of the serverless bundle, which is invisible to every check
 * that reads source or calls a JSON endpoint.
 */
async function verify(token) {
  const out = {};
  // Paced: a burst against this API tripped Vercel's bot protection once and
  // locked the machine out for ~20 minutes.
  for (const p of ['/athletes?limit=1', '/decisions']) {
    await sleep(1500);
    out[p] = { status: await probe(token, p), ok: null, note: '' };
  }
  await sleep(1500);
  const aj = await (await fetch(`${API}/athletes?limit=1`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => null);
  const list = Array.isArray(aj) ? aj : (aj?.athletes || aj?.data || []);
  const row = list[0] || null;
  const id = row && (row._id || row.athleteId);
  if (id) {
    await sleep(1500);
    out[`/athletes/${id}`] = { status: await probe(token, `/athletes/${id}`), ok: null, note: '' };
  }

  // Every document an operator can ask for. The individual report needs a real
  // roster id — an invented one exercises the 403/404 scope path instead of the
  // report — and team.pdf needs that athlete's own sport for the same reason.
  const reports = [
    '/screening-reports/holistic.pdf',
    '/screening-reports/programme-activity.pdf',
    '/screening-reports/activity-log.pdf',
  ];
  if (row && row.sport) reports.push(`/screening-reports/team.pdf?sport=${encodeURIComponent(row.sport)}`);
  if (id) reports.push(`/screening-reports/individual/${id}.pdf`);
  for (const p of reports) {
    await sleep(1500);
    out[p] = await pdfProbe(token, p);
  }
  return out;
}

/** Anything that answered 5xx, or claimed 200 over an incomplete document. */
function brokenIn(results) {
  return Object.entries(results).filter(([, r]) => {
    if (r.ok === false) return true;
    return typeof r.status === 'number' && r.status >= 500;
  });
}

(async () => {
  if (!CONFIRMED) {
    log('This DEPLOYS to the live instance your stakeholders use.');
    log(`  source : ${SOURCE}`);
    log(`  target : ${BRANCH}  (Vercel builds both projects from this)`);
    log('\nRe-run with --yes once you mean it.');
    process.exit(2);
  }

  if (git('status', '--porcelain')) {
    console.error('refusing: the working tree is not clean.');
    process.exit(2);
  }

  git('fetch', 'origin');
  const rollback = git('rev-parse', `origin/${BRANCH}`);
  const target = git('rev-parse', SOURCE);
  if (rollback === target) { log('already deployed — nothing to do.'); process.exit(0); }

  // The merge must already contain production, or this would discard it.
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', rollback, target], { cwd: ROOT });
  } catch {
    console.error(`refusing: ${SOURCE} does not contain origin/${BRANCH}. Merge first.`);
    process.exit(2);
  }

  log(`  rollback point : ${rollback.slice(0, 12)}`);
  log(`  deploying      : ${target.slice(0, 12)}`);
  log(`  ${git('rev-list', '--count', `${rollback}..${target}`)} commit(s)\n`);

  const before = await (await fetch(`${API}/health`).catch(() => ({ json: async () => ({}) }))).json().catch(() => ({}));
  log(`  before: build=${before.build || '(none — old build predates §117)'}`);

  git('push', 'origin', `${SOURCE}:${BRANCH}`);
  log('  pushed. waiting for Vercel to serve the new build…');

  // OBSERVED, NOT SLEPT ON — but it has to be observed CORRECTLY, and the first
  // version of this was not (2026-10-05).
  //
  // It waited for `/api/health` to carry a `build` field at all, on the stated
  // reasoning that "the new code reports build and the old one does not". True
  // when written; false from the moment that field shipped. So on the very next
  // deploy it saw the OLD build answering with a build id after 15 seconds —
  // nowhere near long enough for Vercel to finish — declared the deploy landed,
  // verified the old code, found the reports broken and rolled back a build it
  // had never tested. That is §116.5 reproduced inside the tool written to
  // prevent §116.5.
  //
  // THE DIGEST CANNOT STAND IN FOR IT EITHER. `build` hashes every .js under
  // backend/src, so a deploy that changes only vercel.json, scripts/ or tests/
  // — which is exactly what a bundle fix is — ships an IDENTICAL digest. Waiting
  // for the digest to change would hang for ten minutes on a perfectly good
  // deploy.
  //
  // So the only sound signal is the commit: Vercel sets VERCEL_GIT_COMMIT_SHA,
  // /api/health reports it, and this waits for it to equal the SHA being
  // deployed. Nothing else proves the instance is running this code.
  const want = target.slice(0, 12);
  let landed = false;
  let sawCommitField = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(15000);
    const h = await (await fetch(`${API}/health`).catch(() => null))?.json?.().catch(() => null) || {};
    if (typeof h.commit === 'string' && h.commit) {
      sawCommitField = true;
      if (h.commit === want) {
        landed = true;
        log(`  new build serving: commit ${h.commit}, build ${h.build} (after ~${(i + 1) * 15}s)`);
        break;
      }
    }
    if (i === 0) log(`  (still ${h.commit || 'pre-commit-field'} / ${h.build || 'no build field'}…)`);
  }
  if (!landed && !sawCommitField) {
    log('');
    log('  The instance never reported a `commit`, so this cannot tell whether the');
    log('  deploy landed. That means the DEPLOYED build predates /api/health');
    log('  reporting it — i.e. the push did not take effect, or Vercel is still');
    log('  building. NOT rolling back: there is nothing here to conclude, and');
    log('  rolling back on an unverified reading is what this tool exists to stop.');
  }
  if (!landed) {
    log('  the new build never started serving within 10 minutes.');
    log('  NOT rolling back automatically: a build that never deployed has not');
    log('  replaced anything, and Vercel may still be building. Check the');
    log('  dashboard before doing anything else.');
    process.exit(1);
  }

  const token = await session();
  if (!token) { log('  cannot sign in to verify — check manually before trusting this.'); process.exit(1); }
  const after = await verify(token);
  log('\n  verification:');
  for (const [p, r] of Object.entries(after)) log(`    ${String(r.status).padStart(5)}  ${p}${r.note ? `  — ${r.note}` : ''}`);

  const broken = brokenIn(after);
  if (!broken.length) {
    log('\n  deployed and verified. The §113 endpoints are healthy and every');
    log('  report downloaded as a complete PDF.');
    process.exit(0);
  }

  log(`\n  ${broken.length} check(s) failed. ROLLING BACK.`);
  log('  A 5xx on /athletes/:id or /decisions is §113 — the schema is missing');
  log('  screenings.norm_version_id / scored_at. A failure on a .pdf route is');
  log("  more likely the bundle: pdfkit's font metrics traced out of the");
  log('  function, which is what broke every report until 2026-10-05.');
  git('push', '--force-with-lease', 'origin', `${rollback}:${BRANCH}`);
  log('  rolled back. waiting for the old build…');
  for (let i = 0; i < 40; i += 1) {
    await sleep(15000);
    const t = await session();
    if (t) {
      const re = await verify(t);
      // The PREVIOUS build cannot download a report either — that is the fault
      // being fixed — so the restore is judged on the §113 endpoints alone.
      // Requiring the reports to pass here would mean the rollback could never
      // be declared successful and this would loop for ten minutes before
      // crying "ROLLBACK DID NOT RESTORE HEALTH" about a healthy restore.
      const still = Object.entries(re)
        .filter(([p]) => !p.includes('.pdf'))
        .filter(([, r]) => typeof r.status === 'number' && r.status >= 500);
      if (!still.length) {
        log('  restored — the previous build is serving and healthy.');
        log('\n  NEXT: apply the migration, then run this again.');
        log('    npm run verify:schema -- --url "mysql://…" --insecure');
        log('    npm run migrate:norm-stamp -- --url "mysql://…" --insecure');
        process.exit(1);
      }
    }
  }
  console.error('  ROLLBACK DID NOT RESTORE HEALTH. Intervene manually.');
  console.error(`  The previous good commit is ${rollback}`);
  process.exit(2);
})().catch((e) => { console.error(e); process.exit(2); });
