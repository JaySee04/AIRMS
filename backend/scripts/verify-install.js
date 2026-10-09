// IS THIS INSTALL FIT TO HOLD AN INSTITUTION'S CLINICAL DATA?
//
//   cd backend; npm run verify:install
//
// Run it on the ISN server AFTER configuring and BEFORE inviting anybody.
// READ-ONLY: it opens no files for writing, sends no mail and changes no row.
//
// WHY (2026-10-09, §157). Every other guard in this repo reads the CODE, or
// calls a RUNNING instance. A whole class of fault is invisible to both because
// it lives in the CONFIGURATION of one deployment: a JWT secret left at the
// development value, TLS terminating nowhere, the app connecting as root, a
// reverse proxy whose body limit silently refuses every report. None of those
// break a test. All of them are found on the day, by a clinician.
//
// EXIT CODES  0 ready · 1 at least one BLOCKER · 2 could not check
//
// The split matters more than the checks. A BLOCKER is something that puts
// patient data at risk or stops the system working at all; a WARN is something
// an operator should know and may knowingly accept. Reporting everything at one
// severity is how a real finding gets waved through with the noise.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const results = [];
const add = (level, name, detail, remedy) => results.push({ level, name, detail, remedy });
const ok = (n, d) => add('ok', n, d);
const warn = (n, d, r) => add('warn', n, d, r);
const block = (n, d, r) => add('block', n, d, r);

const env = process.env;
const isTrue = (v) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

// --- 1. Secrets -------------------------------------------------------------
// The JWT secret is the whole session boundary. A short or shared one means
// anybody who has seen this repository can mint a valid admin token.
const secret = env.JWT_SECRET ?? '';
if (!secret) {
  block('JWT_SECRET', 'not set', 'the API exits 1 on boot without it; set a long random value');
} else if (secret.length < 32) {
  block('JWT_SECRET', `only ${secret.length} characters`,
    'use at least 32 random characters — `openssl rand -base64 48`');
} else if (/secret|change|dev|test|airms|password/i.test(secret)) {
  block('JWT_SECRET', 'looks like a placeholder, not a random value',
    'generate one — `openssl rand -base64 48`');
} else {
  ok('JWT_SECRET', `${secret.length} characters, no placeholder words`);
}

// --- 2. Database ------------------------------------------------------------
// SECURITY.md 6.2: open by decision on the demo, not acceptable on a server
// holding an institution's records.
const dbUser = env.MYSQL_USER ?? '';
if (dbUser === 'root') {
  block('Database user', 'the app connects as `root`',
    'create a least-privilege user — the GRANT is written out in docs/SECURITY.md 6.2');
} else if (!dbUser) {
  block('Database user', 'MYSQL_USER not set', 'set it in /etc/airms/api.env');
} else {
  ok('Database user', `connects as \`${dbUser}\``);
}
if (!env.MYSQL_PASSWORD) {
  block('Database password', 'MYSQL_PASSWORD is empty', 'set it');
} else {
  ok('Database password', 'set');
}

// --- 3. Mail ----------------------------------------------------------------
// With SMTP unset the mailer prints to the log instead of sending. That is fine
// for the first install and NOT fine once a clinician is invited, because the
// invitation carries the only credential-establishing code they will get.
if (!env.SMTP_HOST) {
  block('SMTP', 'not configured — mail is printed to the server log, not sent',
    'set SMTP_HOST/USER/PASS/FROM together, using ISN\'s relay');
} else {
  const from = env.SMTP_FROM ?? '';
  const consumer = /@(gmail|yahoo|hotmail|outlook|live)\./i.test(from);
  const fromDomain = (from.match(/@([^\s>]+)/) ?? [])[1] ?? '';
  const userDomain = (String(env.SMTP_USER ?? '').match(/@(.+)$/) ?? [])[1] ?? '';
  if (consumer) {
    warn('SMTP sender', `sends as a consumer address (${from})`,
      'a clinician reads that as phishing — use an isn.gov.my sender on ISN\'s relay');
  } else if (fromDomain && userDomain && fromDomain.toLowerCase() !== userDomain.toLowerCase()) {
    // The silent one: a provider only sends as the account it authenticated, so
    // an isn.gov.my From on a Gmail transport is REWRITTEN and the config lies.
    block('SMTP sender', `SMTP_FROM is @${fromDomain} but the account is @${userDomain}`,
      'the provider will rewrite the From — move SMTP_HOST/USER/PASS/FROM together');
  } else {
    ok('SMTP', `configured, sending as ${from || userDomain}`);
  }
}

// --- 4. Origins and TLS -----------------------------------------------------
// AIRMS speaks plain HTTP and assumes TLS terminates at a reverse proxy. If the
// browser-facing origins are http://, IC numbers and clinical notes are on the
// wire in clear.
const origins = String(env.FRONTEND_URL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!origins.length) {
  block('FRONTEND_URL', 'not set — CORS will refuse the web app',
    'set it to the browser-facing origin(s)');
} else {
  const insecure = origins.filter((o) => /^http:\/\//i.test(o) && !/localhost|127\.0\.0\.1/.test(o));
  if (insecure.length) {
    block('TLS', `web origin is plain HTTP: ${insecure.join(', ')}`,
      'terminate TLS at the reverse proxy — AIRMS has no certificate handling, '
      + 'and an IC encodes date of birth, birth state and sex');
  } else {
    ok('TLS', `origins are https (or loopback): ${origins.join(', ')}`);
  }
}

// --- 5. Uploads -------------------------------------------------------------
// nginx's default client_max_body_size is 1 MB; real reports run to 13.67 MB.
// This cannot see the proxy, so it reports what AIRMS will accept and says what
// to match.
try {
  // eslint-disable-next-line global-require
  const { maxUploadBytes } = require('../src/utils/uploadLimits');
  const mb = (maxUploadBytes(env) / (1024 * 1024)).toFixed(1);
  if (maxUploadBytes(env) < 14 * 1024 * 1024) {
    warn('Upload limit', `${mb} MB — the largest report measured is 13.67 MB`,
      'raise AIRMS_MAX_UPLOAD_BYTES, and match the proxy\'s client_max_body_size');
  } else {
    ok('Upload limit', `${mb} MB (largest report measured: 13.67 MB)`);
  }
} catch { warn('Upload limit', 'could not be read', 'check utils/uploadLimits.js'); }

// --- 6. Import path ---------------------------------------------------------
// No vision key is a SUPPORTED configuration (§112): expanded reports read from
// the text layer and cost nothing. It only matters for the compact layout.
if (!env.VISION_API_KEY) {
  warn('Vision provider', 'not configured — the compact 12-page layout cannot be imported',
    'fine if ISN exports the expanded report; otherwise set VISION_* ');
} else {
  ok('Vision provider', `configured (${env.VISION_MODEL || 'default model'})`);
}
try {
  // eslint-disable-next-line global-require
  const { hourlyCap, DEFAULT_LIMIT } = require('../src/utils/visionThrottle');
  const cap = hourlyCap(env);
  ok('Vision hourly cap', `${cap}/hour per user${cap === DEFAULT_LIMIT ? ' (default)' : ' (AIRMS_VISION_HOURLY_CAP)'}`);
} catch { /* optional */ }

// --- 7. Scheduler -----------------------------------------------------------
// Default is ON. Both running is safe (cross-process lock) but muddy.
if (isTrue(env.MAIL_SCHEDULER) || env.MAIL_SCHEDULER === undefined) {
  warn('Mail scheduler', 'the in-process ticker is ON',
    'if airms-mail.timer is installed, set MAIL_SCHEDULER=off so one owns it');
} else {
  ok('Mail scheduler', 'in-process ticker off — an OS timer is expected to drive it');
}

// --- 8. Dangerous switches --------------------------------------------------
if (isTrue(env.SQL_SYNC)) {
  block('SQL_SYNC', 'is on — the app will ALTER tables at boot',
    'unset it; schema changes belong to the migration scripts');
} else { ok('SQL_SYNC', 'off'); }
if (isTrue(env.MAILER_DRY_RUN)) {
  block('MAILER_DRY_RUN', 'is on — no mail will actually be sent', 'unset it');
} else { ok('MAILER_DRY_RUN', 'off'); }
if (env.NODE_ENV !== 'production') {
  warn('NODE_ENV', `is "${env.NODE_ENV ?? 'unset'}"`,
    'set production — it also arms the seeder\'s refusal to run here');
} else { ok('NODE_ENV', 'production'); }

// --- report -----------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const blockers = results.filter((r) => r.level === 'block');
const warns = results.filter((r) => r.level === 'warn');

console.log('\n  AIRMS install check — configuration, not code\n');
for (const r of results) {
  const tag = r.level === 'ok' ? 'ok    ' : r.level === 'warn' ? 'WARN  ' : 'BLOCK ';
  console.log(`  ${tag}${pad(r.name, 20)} ${r.detail}`);
  if (r.remedy) console.log(`        ${' '.repeat(20)} -> ${r.remedy}`);
}

console.log(`\n  ${results.filter((r) => r.level === 'ok').length} ok · ${warns.length} warning(s) · ${blockers.length} blocker(s)\n`);
if (blockers.length) {
  console.error('  NOT READY. Every blocker above either risks clinical data or stops');
  console.error('  the system working. Warnings are for an operator to accept knowingly.\n');
  process.exit(1);
}
console.log('  No blockers. Re-run after any change to /etc/airms/*.env.\n');
console.log('  This checks CONFIGURATION ONLY. Still run, against this server:');
console.log('    npm run verify:schema     does the database have every column the models declare');
console.log('    npm run verify:reports    can each role download a complete PDF\n');
