#!/usr/bin/env node
/**
 * MAIL SIMULATION — drive every outbound mail path and report who gets what.
 *
 *   node scripts/mail-simulation.js            # DRY RUN, sends nothing
 *   node scripts/mail-simulation.js --live     # actually sends
 *
 * WHY THIS EXISTS. The failure mode of the notification subsystem is SILENCE:
 * a scoped recipient list that is quietly too wide leaks one sport's athletes
 * to another sport's coach, and a list that is quietly too narrow means a
 * clinician is never told. Neither shows up in a log, and no unit test can tell
 * you whether a real inbox received a real message.
 *
 * WHAT IT PRODUCES. A manifest, per address, of every message the code tried to
 * send — and, derived from the same capture, every event each address should
 * receive NOTHING from. The reader checks their inboxes against it. **The empty
 * rows are the valuable half**, because only a human looking at an inbox can
 * confirm that nothing arrived.
 *
 * It captures by patching the mailer's export BEFORE the consumers are
 * required, because each of them destructures `const { sendMail } = ...` at
 * module load and would otherwise hold the original reference.
 *
 * DRY RUN IS THE DEFAULT and the live run needs --live, because this reaches
 * real mailboxes and cannot be undone.
 */

require('dotenv').config();

const LIVE = process.argv.includes('--live');
const io = require('fs');
const MANIFEST = require('path').join(__dirname, 'mail-manifest.md');
const PACE_MS = Number((process.argv.find((a) => a.startsWith('--pace=')) || '').split('=')[1]) || 1200;

// Sends nothing unless --live. Set before ANY module that builds a transport.
if (!LIVE) process.env.MAILER_DRY_RUN = 'true';

// A LIVE RUN THAT SENDS NOTHING MUST NOT REPORT SUCCESS.
//
// dotenv resolves .env against the CURRENT WORKING DIRECTORY, so running this
// from the repository root instead of backend/ loads no configuration at all.
// SMTP_HOST is then undefined, mailer.js silently falls back to its console
// transport, and the run prints "13 message(s) SENT" having sent none — a
// clean-looking result from a run that did nothing, which is this project's
// defect class exactly. Refuse instead.
if (LIVE) {
  const why = !process.env.SMTP_HOST
    ? 'SMTP_HOST is not set — run this from backend/, not the repository root, so dotenv finds .env'
    : process.env.MAILER_DRY_RUN === 'true'
      ? 'MAILER_DRY_RUN=true is set in the environment, which forces the console transport'
      : null;
  if (why) {
    console.error(`REFUSING a live run: ${why}`);
    process.exit(2);
  }
}

// ── capture, before consumers destructure ────────────────────────────────────
const mailer = require('../src/utils/mailer');
const captured = [];
let currentEvent = '(setup)';
const realSendMail = mailer.sendMail;
mailer.sendMail = async function recordingSendMail(msg) {
  const to = String(msg.to || '').split(',').map((s) => s.trim()).filter(Boolean);
  captured.push({
    event: currentEvent,
    to,
    subject: msg.subject,
    attachments: (msg.attachments || []).map((a) => a.filename || '(unnamed)'),
  });
  return realSendMail(msg);
};

const { sequelize, User, Athlete, Screening } = require('../src/models');
const { getSettings, setSetting } = require('../src/utils/settings');
const { alertMany } = require('../src/utils/alerts');
const { notifyOverrideToCoach, notifyInjuryToCoach } = require('../src/utils/notifications');
const { runDigestOnce, runReminderOnce } = require('../src/utils/scheduler');
const { sendInvite } = require('../src/utils/invite');

// ── the cast ─────────────────────────────────────────────────────────────────
// One address per role. The sport split is the scope test: COACH_A covers the
// sport the seeded athletes are in, COACH_B covers one they are not, so
// COACH_B's correct result is an empty inbox.
// NOTE WHICH ADDRESS IS ABSENT. poseidonapollo11@gmail.com is the SENDER
// (SMTP_FROM), and Gmail files self-addressed mail under All Mail rather than
// the Inbox. A role on that address produces a false negative for anything it
// should receive, and a false PASS for anything it should not — so it is the
// sender and nothing else.
//
// The athlete uses a +tag on the admin's inbox. Both land in one mailbox and
// are told apart by the To: header, which is safe here because their
// expectations are opposites: the admin should receive several messages and the
// athlete should receive none at all.
// ADDRESSES ARE NOT IN THIS FILE, AND MUST NOT BE PUT BACK.
//
// They are real personal mailboxes. Hardcoding them puts them in the
// repository, in the ISN handover, and in every diff for ever. The cast is read
// from scripts/mail-cast.json, which is gitignored, and the script explains how
// to create one when it is absent.
const CAST_FILE = require('path').join(__dirname, 'mail-cast.json');
const ROLES_NEEDED = [
  { key: 'admin',     role: 'admin',     name: 'Sim Admin' },
  { key: 'executive', role: 'executive', name: 'Sim Executive' },
  { key: 'medicalA',  role: 'medical',   name: 'Sim Medical A' },
  { key: 'medicalB',  role: 'medical',   name: 'Sim Medical B' },
  { key: 'coachA',    role: 'coach',     name: 'Sim Coach A' },
  { key: 'coachB',    role: 'coach',     name: 'Sim Coach B' },
  { key: 'athlete',   role: 'athlete',   name: 'Sim Athlete' },
];

function loadCast() {
  let raw;
  try {
    raw = JSON.parse(require('fs').readFileSync(CAST_FILE, 'utf8'));
  } catch {
    console.error(`No cast file. Create ${CAST_FILE} with one address per role:\n`);
    console.error(JSON.stringify(
      Object.fromEntries(ROLES_NEEDED.map((r) => [r.key, `you+${r.key}@example.com`])), null, 2));
    console.error('\nUse addresses you own. Gmail +tags land in one inbox and cost nothing.');
    console.error('Do NOT use the address in SMTP_FROM: a sender that is also a recipient');
    console.error('has its own mail filed under All Mail rather than the Inbox, which reads');
    console.error('as "nothing arrived" for a message that did.');
    process.exit(2);
  }
  const missing = ROLES_NEEDED.filter((r) => !raw[r.key]);
  if (missing.length) {
    console.error(`Cast file is missing: ${missing.map((m) => m.key).join(', ')}`);
    process.exit(2);
  }
  const sender = (process.env.SMTP_FROM || '').match(/<([^>]+)>|(\S+@\S+)/);
  const senderAddr = sender ? (sender[1] || sender[2]) : null;
  const clash = ROLES_NEEDED.find((r) => raw[r.key] === senderAddr);
  if (clash) {
    console.error(`Cast "${clash.key}" is ${senderAddr}, which is the SMTP sender. Use another address.`);
    process.exit(2);
  }
  return ROLES_NEEDED.map((r) => ({ ...r, email: String(raw[r.key]).trim() }));
}

const CAST = loadCast();
const by = (k) => CAST.find((c) => c.key === k);

// Ids switched off for the duration; restore() reads this after main resolves
// OR throws, so it cannot be scoped inside main.
const PARKED = [];

const log = (...a) => console.log(...a);
const rule = () => log('─'.repeat(78));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  currentEvent = name;
  const before = captured.length;
  let note = '';
  try {
    note = (await fn()) || '';
  } catch (err) {
    note = `ERROR: ${err.message}`;
  }
  const n = captured.length - before;
  log(`  ${name.padEnd(34)} ${String(n).padStart(2)} message(s)  ${note}`);
  if (LIVE && n) await sleep(PACE_MS);
  return n;
}

async function main() {
  log(LIVE ? '*** LIVE RUN — real email will be sent ***' : 'DRY RUN — nothing will be sent');
  log(`sender: ${process.env.SMTP_FROM || '(unset)'}`);
  rule();

  await sequelize.authenticate();

  // ── cast setup ─────────────────────────────────────────────────────────────
  // Point the simulation addresses at real accounts. Existing users with these
  // addresses are reused; the role and sport are forced so the run is
  // repeatable regardless of what a previous run left behind.
  const sports = [...new Set((await Athlete.findAll({ attributes: ['sport'] })).map((a) => a.sport))];
  const busiest = (await Athlete.findAll({ attributes: ['sport'] }))
    .reduce((m, a) => (m[a.sport] = (m[a.sport] || 0) + 1, m), {});
  const sportA = Object.entries(busiest).sort((x, y) => y[1] - x[1])[0][0];
  const sportB = sports.find((s) => s !== sportA) || 'Archery';
  log(`cohort sports: A = ${sportA} (${busiest[sportA]} athletes), B = ${sportB} (${busiest[sportB] || 0})`);

  const ids = {};
  const rows = {};
  for (const c of CAST) {
    const sport = c.key === 'coachA' ? sportA : c.key === 'coachB' ? sportB : null;
    let u = await User.findOne({ where: { email: c.email } });
    if (!u) u = await User.create({ name: c.name, email: c.email, role: c.role, password: 'Simulation#2026', isActive: true, coachSport: sport });
    else await u.update({ name: c.name, role: c.role, isActive: true, coachSport: sport, notifyPrefs: null });
    ids[c.key] = u.id;
    rows[c.key] = u;
  }
  log(`cast: ${CAST.length} accounts ready`);

  // ── isolation ──────────────────────────────────────────────────────────────
  //
  // Every other staff account would also be mailed: four @isn.gov.my addresses
  // that BOUNCE (the notices land in the sender's own inbox) and two +tag
  // addresses that land in a mailbox the reader is already checking for another
  // role. Both kinds make the manifest something other than what arrives.
  //
  // So they are switched off for the run and switched back on in a finally.
  // The ids are printed before anything is changed, so a crash between the two
  // leaves a recoverable record on screen rather than a silently disabled
  // account.
  const STAFF = ['admin', 'medical', 'coach', 'executive'];
  const others = await User.findAll({
    where: { isActive: true, role: STAFF },
    attributes: ['id', 'email', 'role'],
  });
  const extra = others.filter((u) => !CAST.some((c) => c.email === u.email));
  PARKED.push(...extra.map((u) => u.id));
  if (PARKED.length) {
    log('isolating — these accounts are switched OFF for the run and back on afterwards:');
    for (const u of extra) log(`   #${String(u.id).padEnd(4)} ${u.role.padEnd(10)} ${u.email}`);
    await User.update({ isActive: false }, { where: { id: PARKED } });
  }

  // ISOLATION IS A PRECONDITION, NOT A STEP — SO VERIFY IT BEFORE SENDING.
  //
  // The first live run reported `isolation held: 0 non-cast account(s) off`
  // and mailed a wider set than intended. It has not reproduced in eight
  // subsequent runs across both shells, and rather than invent a cause this
  // asks the database what is actually true AFTER the update and refuses to
  // send if the answer is wrong.
  //
  // The distinction that matters: the old code reported the state afterwards,
  // when the mail had already gone. This one gates on it. An unexplained
  // intermittent that cannot reach the send path cannot send to the wrong
  // people, whatever its cause turns out to be.
  const stillActive = await User.findAll({
    where: { isActive: true, role: STAFF },
    attributes: ['id', 'email', 'role'],
  });
  const unparked = stillActive.filter((u) => !CAST.some((c) => c.email === u.email));
  if (unparked.length) {
    log('');
    log('REFUSING TO SEND — isolation did not take effect. Still active and not in the cast:');
    for (const u of unparked) log(`   #${String(u.id).padEnd(4)} ${u.role.padEnd(10)} ${u.email}`);
    log('');
    log('Nothing has been sent. Re-run; if it persists, switch these off by hand.');
    throw new Error(`isolation failed: ${unparked.length} non-cast staff account(s) still active`);
  }
  log(`isolation verified against the database: ${PARKED.length} off, ${stillActive.length} cast account(s) active.`);
  rule();

  // Pick subjects for the per-athlete events.
  // SPORT A ONLY. Taking the three most recent screenings pulled in an athlete
  // from sport B, so coach B would have CORRECTLY received mail and the scope
  // invariant would have reported a defect that was mine, not the system's.
  const inSportA = await Athlete.findAll({ where: { sport: sportA }, attributes: ['athleteId'], raw: true });
  const sportAIds = new Set(inSportA.map((a) => a.athleteId));
  const flagged = await Screening.findAll({ order: [['assessedAt', 'DESC']], limit: 80 });
  const athleteIds = [...new Set(flagged.map((s) => s.athleteId))].filter((id) => sportAIds.has(id)).slice(0, 3);
  const oneAthlete = await Athlete.findOne({ where: { sport: sportA } });

  log('EVENTS');
  const settings = await getSettings();

  await step('invitation', () => sendInvite(rows.medicalB, { user: { name: by('admin').name } }, { creating: false })
    .then(() => 'account-establishment code'));

  await step('import alert (flagged athletes)', async () => {
    const r = await alertMany(athleteIds);
    return `${athleteIds.length} athlete(s) in ${sportA}`;
  });

  await step('band override -> coach', () =>
    notifyOverrideToCoach(oneAthlete, 'red', 'Simulation — not a clinical finding.', by('medicalA').name)
      .then((r) => (r.sent ? `coach of ${sportA} only` : `not sent: ${r.reason}`)));

  await step('injury flag -> coach', () =>
    notifyInjuryToCoach(oneAthlete, true, 'Simulation — not a clinical finding.', by('medicalA').name)
      .then((r) => (r.sent ? 'coach of the athlete sport' : `not sent: ${r.reason}`)));

  await step('monthly digest (+ holistic PDF)', () =>
    runDigestOnce(new Date(), { force: true }).then((r) => r.sent ? 'admin + executive' : `not sent: ${r.reason}`));

  await step('rescreen recall', () =>
    runReminderOnce(new Date(), { force: true }).then((r) => r.sent ? 'admin + medical + per-sport coach' : `not sent: ${r.reason}`));

  // ── the negative cases, which are the point ────────────────────────────────
  rule();
  log('NEGATIVE CASES — each of these must send NOTHING');

  await User.update({ notifyPrefs: { digest: false } }, { where: { id: ids.executive } });
  const optOut = await step('digest, executive opted out', () =>
    runDigestOnce(new Date(), { force: true }).then((r) => r.sent ? 'sent — executive must be absent' : `not sent: ${r.reason}`));
  await User.update({ notifyPrefs: null }, { where: { id: ids.executive } });

  await setSetting('digest_enabled', false);
  await step('digest, institution switch OFF', () =>
    runDigestOnce(new Date(), { force: true }).then((r) => r.sent ? 'SENT — THIS IS A DEFECT' : `correctly refused: ${r.reason}`));
  await setSetting('digest_enabled', settings.digest_enabled);

  // ── manifest ───────────────────────────────────────────────────────────────
  rule();
  const events = [...new Set(captured.map((c) => c.event))];
  log('MANIFEST — what each address should find\n');
  for (const c of CAST) {
    const mine = captured.filter((m) => m.to.includes(c.email));
    log(`${c.key.toUpperCase()}  ${c.email}`);
    if (mine.length) {
      for (const m of mine) {
        log(`   EXPECT  ${m.subject}${m.attachments.length ? `   [attachment: ${m.attachments.join(', ')}]` : ''}`);
      }
    } else {
      log('   EXPECT  (nothing at all)');
    }
    const silent = events.filter((e) => !mine.some((m) => m.event === e));
    if (silent.length) log(`   NONE from: ${silent.join(', ')}`);
    log('');
  }

  // Isolation is only worth anything if it HELD. Assert it on the capture
  // rather than assuming the update took.
  // A VACUOUS PASS IS NOT A PASS. If nothing was parked, `leaked` is empty for
  // the trivial reason that there was nothing to leak — and the old wording
  // ("isolation held: 0 non-cast account(s) off, none received mail") reported
  // that as success. It is the opposite: isolation did not run, so every other
  // staff account in the database received the live mail.
  const fails = [];
  const leaked = extra.filter((u) => captured.some((m) => m.to.includes(u.email)));
  rule();
  if (!PARKED.length) {
    log('ISOLATION DID NOT RUN — no non-cast staff account was switched off.');
    log('Either the database holds none, or the query found none. Recipients were');
    log('NOT limited to the cast; read the full recipient list below.');
    fails.push('isolation did not run');
  } else if (leaked.length) {
    log('ISOLATION FAILED — these non-cast accounts were mailed anyway:');
    for (const u of leaked) log(`   ${u.role.padEnd(10)} ${u.email}`);
    fails.push('isolation failed');
  } else {
    log(`isolation held: ${PARKED.length} non-cast account(s) off, none received mail.`);
  }

  // EVERY RECIPIENT OF EVERY MESSAGE, always. Without this the manifest only
  // names the cast, so a message that went somewhere unintended leaves no trace
  // in the run's own output and cannot be reconstructed afterwards.
  rule();
  log('FULL RECIPIENT LIST — every address this run actually addressed:');
  const everyone = [...new Set(captured.flatMap((m) => m.to))].sort();
  for (const addr of everyone) {
    const mine = captured.filter((m) => m.to.includes(addr));
    const known = CAST.some((c) => c.email === addr) ? '' : '   <-- NOT IN THE CAST';
    log(`   ${String(mine.length).padStart(2)}x  ${addr}${known}`);
  }

  // ── invariants ─────────────────────────────────────────────────────────────
  // Write the manifest out too: checking seven inboxes against a terminal
  // scrollback is how a row gets skipped, and the empty rows are the half that
  // matters.
  const md = ['# Mail simulation manifest', '',
    `Run ${new Date().toISOString()} — ${LIVE ? 'LIVE' : 'DRY RUN'}.`,
    `Sender: \`${process.env.SMTP_FROM}\``, '',
    '## Check each inbox against this', ''];
  for (const c of CAST) {
    const mine = captured.filter((m) => m.to.includes(c.email));
    md.push(`### ${c.key} — \`${c.email}\``, '');
    if (mine.length) md.push('| should arrive | attachment |', '|---|---|');
    else md.push('**Nothing at all should arrive.**');
    for (const m of mine) md.push(`| ${m.subject} | ${m.attachments.join(', ') || '—'} |`);
    const silent = events.filter((e) => !mine.some((m) => m.event === e));
    if (silent.length) md.push('', `Nothing from: ${silent.join('; ')}.`);
    md.push('');
  }
  io.writeFileSync(MANIFEST, md.join('\n'));
  log(`manifest written: ${MANIFEST}`);

  rule();
  log('INVARIANTS');
  const check = (name, ok, detail) => {
    log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    if (!ok) fails.push(name);
  };
  const toOf = (event) => captured.filter((m) => m.event === event).flatMap((m) => m.to);

  check('executive is NOT a rescreen-recall recipient',
    !toOf('rescreen recall').includes(by('executive').email));
  check('coach B (other sport) receives no alert about sport A',
    !toOf('import alert (flagged athletes)').includes(by('coachB').email));
  check('coach B receives no override notice for another sport\'s athlete',
    !toOf('band override -> coach').includes(by('coachB').email));
  check('the athlete receives no staff alert',
    !toOf('import alert (flagged athletes)').includes(by('athlete').email));
  check('the invitee receives the invitation',
    toOf('invitation').includes(by('medicalB').email));
  check('opting out removes only that recipient',
    !captured.filter((m) => m.event === 'digest, executive opted out').some((m) => m.to.includes(by('executive').email)),
    optOut ? 'others still received' : 'nothing sent at all');
  check('the institution switch overrides individual opt-IN',
    !captured.some((m) => m.event === 'digest, institution switch OFF'));

  rule();
  log(`${captured.length} message(s) ${LIVE ? 'SENT' : 'would be sent'} across ${events.length} event(s).`);
  if (!LIVE) log('\nDry run. Re-run with --live to send for real.');
  if (fails.length) {
    log(`\n${fails.length} INVARIANT(S) FAILED — these are defects, not noise.`);
    process.exitCode = 1;
  }
}

// Switching accounts back on is not optional and must survive a thrown run, so
// it lives here rather than at the end of main().
async function restore() {
  if (!PARKED.length) return;
  const [n] = await User.update({ isActive: true }, { where: { id: PARKED } });
  console.log(`restored: ${n} account(s) switched back on.`);
}

main()
  .then(restore)
  .catch(async (err) => {
    console.error('\nsimulation failed:', err.message);
    console.error(err.stack);
    try { await restore(); } catch (e) { console.error('RESTORE ALSO FAILED — switch these back on by hand:', PARKED.join(', ')); }
    process.exitCode = 2;
  })
  .finally(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
