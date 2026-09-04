#!/usr/bin/env node
// Run the hosted migration WITHOUT anybody typing or pasting a credential.
//
//   cd backend
//   npx vercel login          # one interactive step — only a human can do this
//   npm run migrate:hosted
//
// Why this exists: the hosted database's credentials live in Vercel's project
// environment and nowhere on the development machine. The alternative is
// pasting a connection string into a terminal — or worse, into a chat — where
// it lands in shell history, scrollback and any transcript. This pulls the
// values straight from the linked project, uses them, and deletes them.
//
// `backend/.vercel/project.json` already links this directory to `airms-api`,
// so there is nothing to configure. If the CLI is not logged in, that is the
// only thing this cannot do for you, and it says so.
//
// See docs/DEPLOY.md and CLAUDE.md gotcha 3.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airms-migrate-'));
const envFile = path.join(tmp, '.env.production');
const caFile = path.join(tmp, 'ca.pem');

// Everything secret this script touches lives in `tmp`, so one cleanup covers
// it — including on a crash, which is when it matters.
function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

function vercel(args) {
  return execFileSync('npx', ['--yes', 'vercel@latest', ...args], {
    cwd: BACKEND, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let who;
try {
  who = vercel(['whoami']).trim().split('\n').pop().trim();
} catch {
  who = null;
}
if (!who || /logged out/i.test(who)) {
  console.error('Not logged in to Vercel, and logging in needs a browser.\n');
  console.error('  cd "%s"', BACKEND);
  console.error('  npx vercel login');
  console.error('  npm run migrate:hosted\n');
  console.error('That is the only step here a person has to do. Everything after it,');
  console.error('including reading the credentials and deleting them again, is automatic.');
  process.exit(2);
}
console.log(`vercel   : logged in as ${who}`);

console.log('pulling  : production environment for the linked project (airms-api)');
try {
  vercel(['env', 'pull', envFile, '--environment=production', '--yes']);
} catch (err) {
  console.error('\nCould not pull the production environment.');
  console.error(String(err.stderr || err.message).trim());
  process.exit(1);
}

// Parse a dotenv file well enough for the six keys we need. Values may be
// quoted, and MYSQL_SSL_CA is a PEM with literal \n escapes in it.
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

const need = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = need.filter((k) => !env[k]);
if (missing.length) {
  console.error(`\nThe pulled environment has no ${missing.join(', ')}.`);
  console.error('Check that this directory is linked to airms-api (backend/.vercel/project.json)');
  console.error('and that the production environment carries the MYSQL_* variables.');
  process.exit(1);
}

// Vercel's SENSITIVE environment variables are write-only. `env pull` succeeds,
// reports "Secret values cannot be pulled", and substitutes the literal string
// "[SENSITIVE]" for each one — so without this check the script would sail on
// and try to resolve a host literally named [SENSITIVE], failing with
// `getaddrinfo ENOTFOUND [SENSITIVE]`. That error names the symptom and hides
// the cause, which is the failure shape this codebase exists to avoid.
//
// This is not a permissions problem and logging in as somebody else will not
// fix it. Nobody can read these back — that is the feature.
const sealed = need.filter((k) => env[k] === '[SENSITIVE]');
if (sealed.length) {
  console.error('\nThe database credentials are marked SENSITIVE in Vercel, which makes them');
  console.error(`write-only: ${sealed.join(', ')} came back as the literal placeholder`);
  console.error('"[SENSITIVE]". No tool can read them back — not this script, not the CLI,');
  console.error('not the dashboard, not the account owner. Only the running function gets');
  console.error('the real values.\n');
  console.error('So this migration cannot be driven from a development machine using the');
  console.error('Vercel-stored credentials. The ways left are:\n');
  console.error('  1. Copy the connection string from the Aiven console and pass it directly:');
  console.error('       npm run migrate:screening-unique -- --url "mysql://..." --ca ./ca.pem');
  console.error('  2. Run it from inside the deployed API, which already holds the credentials.');
  console.error('  3. Un-mark the MYSQL_* variables as Sensitive in the Vercel dashboard and');
  console.error('     re-run this script — though write-only is the better setting to keep.\n');
  console.error('See docs/DEPLOY.md.');
  process.exit(3);
}

// Say WHICH database, before touching it. Running a migration against the wrong
// one is the mistake worth making loud — and the password is never printed.
console.log(`target   : ${env.MYSQL_USER}@${env.MYSQL_HOST}:${env.MYSQL_PORT || 3306}/${env.MYSQL_DATABASE}`);

const childEnv = {
  ...process.env,
  MYSQL_HOST: env.MYSQL_HOST,
  MYSQL_PORT: env.MYSQL_PORT || '3306',
  MYSQL_USER: env.MYSQL_USER,
  MYSQL_PASSWORD: env.MYSQL_PASSWORD,
  MYSQL_DATABASE: env.MYSQL_DATABASE,
};

if (env.MYSQL_SSL_CA && env.MYSQL_SSL_CA.includes('BEGIN CERTIFICATE')) {
  // Stored as one line with escaped newlines; mysql2 needs a real PEM.
  fs.writeFileSync(caFile, env.MYSQL_SSL_CA.replace(/\\n/g, '\n'), { mode: 0o600 });
  childEnv.MYSQL_SSL = '1';
  childEnv.MYSQL_SSL_CA = caFile;
  console.log('tls      : on, using the CA from the project environment');
} else if (String(env.MYSQL_SSL || '') === '1') {
  childEnv.MYSQL_SSL = '1';
  console.log('tls      : on, no CA in the environment (server certificate not pinned)');
} else {
  console.log('tls      : off per the project environment');
}

console.log('');
const r = spawnSync(process.execPath, [path.join(__dirname, 'migrate-screening-unique.js')], {
  cwd: BACKEND, env: childEnv, stdio: 'inherit',
});

cleanup();
process.exit(r.status === null ? 1 : r.status);
