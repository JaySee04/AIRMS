#!/usr/bin/env node
// IS THIS DATABASE READY TO HOLD REAL ATHLETES? (2026-10-12, DESIGN_DECISIONS §162)
//
// READ-ONLY. Changes nothing, ever.
//
// EXIT CODES  0 ready · 1 at least one BLOCKER · 2 could not check
//
// The gap this fills. Before today three commands looked at an install and not
// one of them could see fabricated patients:
//
//   verify:install   the CONFIGURATION — every check is an env var
//   verify:schema    the SHAPE of the database — information_schema
//   verify:claims    the BEHAVIOUR of a running instance
//
// None of them asks what is actually IN the tables. So an ISN server could be
// correctly configured, correctly migrated, behaving correctly, and serving
// sixty invented athletes beside the real ones — with every guard green.
//
// The question is deliberately absolute: on a database that is about to hold
// real athletes, ANY fabricated artefact is a blocker. There is no safe amount
// of fake patient data in a clinical system, and "we know which ones are fake"
// is exactly the knowledge that does not survive a handover.
//
// WHY THE NORMS CHECK IS HERE AND NOT IN verify:schema. A cohort norm is the
// RULER every band is measured against. Norms computed over fabricated athletes
// do not announce themselves — real athletes simply get scored against invented
// peers, and the verdict looks exactly like a real one. That is this project's
// defect class aimed at the one number a clinician acts on.
//
// Usage:
//   cd backend; npm run verify:data
//   cd backend; npm run verify:data -- --url "mysql://..." --ca ./ca.pem

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const results = [];
const add = (level, name, detail, remedy) => results.push({ level, name, detail, remedy });
const ok = (n, d) => add('ok', n, d);
const warn = (n, d, r) => add('warn', n, d, r);
const block = (n, d, r) => add('block', n, d, r);

async function main() {
  // Required lazily: building a Sequelize instance at import time means a bad
  // connection string crashes before the banner explains what is being checked.
  const { sequelize, User, Athlete, AuditLog, CohortNormVersion, Setting } = require('../src/models');
  const { buildUsers, DEMO_PASSWORD } = require('../src/utils/seeder');
  const { DEMO_DIRECTORY, isnDirectoryStatus } = require('../src/mock/isnDirectory');
  const bcrypt = require('bcryptjs');

  console.log(`\n  Target: ${sequelize.config.host}/${sequelize.config.database}\n`);

  // ── 1. Demo accounts ──────────────────────────────────────────────────────
  // DERIVED from buildUsers(), never retyped — a demo account added later would
  // otherwise stop being recognised as one, which fails in the direction where
  // a fabricated database reads as a real one.
  const demoEmails = buildUsers().map((u) => u.email);
  const demoUsers = await User.findAll({ where: { email: demoEmails }, attributes: ['id', 'email', 'role'] });
  const totalUsers = await User.count();
  if (demoUsers.length) {
    block('Demo accounts', `${demoUsers.length} of ${totalUsers} account(s) are seeded demo logins`,
      `Their password is published in the project docs. Delete them, or start from an empty\n`
      + `        database and use: npm run bootstrap:admin -- --email ... --name ...\n`
      + `        ${demoUsers.map((u) => `${u.email} (${u.role})`).join(', ')}`);
  } else {
    ok('Demo accounts', `none of the ${totalUsers} account(s) are seeded demo logins`);
  }

  // ── 2. The published password, wherever it is ─────────────────────────────
  // Not the same question as (1). An account created by hand can still carry
  // the demo password — somebody copies it out of the docs while setting up —
  // and that account would pass every other check here.
  const CAP = 300;
  const all = await User.findAll({ attributes: ['email', 'password'], limit: CAP + 1 });
  const capped = all.length > CAP;
  const weak = [];
  for (const u of all.slice(0, CAP)) {
    // eslint-disable-next-line no-await-in-loop
    if (u.password && await bcrypt.compare(DEMO_PASSWORD, u.password)) weak.push(u.email);
  }
  if (weak.length) {
    block('Published password', `${weak.length} account(s) use the demo password`,
      `Reset them. ${weak.slice(0, 6).join(', ')}${weak.length > 6 ? ' …' : ''}`);
  } else {
    ok('Published password', `no account uses it${capped ? ` (checked the first ${CAP})` : ''}`);
  }

  // ── 3. Fixture athletes on the roster ─────────────────────────────────────
  // The demo-report athletes are real people whose reports were handed over for
  // a demonstration, carrying dates of birth tuned to the printed report rather
  // than their own. They must not become roster rows on a real install.
  const fixtureIcs = DEMO_DIRECTORY.map((r) => r.icNumber);
  const seededAthleteIds = buildUsers().map((u) => u.athleteId).filter(Boolean);
  const known = [...new Set([...fixtureIcs, ...seededAthleteIds])];
  const totalAthletes = await Athlete.count();
  const fixtureRows = known.length
    ? await Athlete.findAll({ where: { athleteId: known }, attributes: ['athleteId', 'name'] })
    : [];
  if (fixtureRows.length) {
    block('Fixture athletes', `${fixtureRows.length} of ${totalAthletes} roster athlete(s) are known fixtures`,
      `${fixtureRows.map((a) => `${a.name} (${a.athleteId})`).join(', ')}`);
  } else if (demoUsers.length && totalAthletes > 0) {
    // The roster is almost certainly seeded too — the ~60 seeded athletes carry
    // no marker, so this says what it actually knows rather than guessing.
    warn('Fixture athletes', `no KNOWN fixture IC on the roster, but demo accounts exist`,
      `A seeded roster carries no marker, so this cannot name the other ~60.\n`
      + `        Treat the whole database as fabricated if (1) blocked.`);
  } else {
    ok('Fixture athletes', `none of the ${totalAthletes} roster athlete(s) are known fixtures`);
  }

  // ── 4. The ISN directory being served ─────────────────────────────────────
  const dir = isnDirectoryStatus();
  if (dir.isFixture) {
    block('ISN directory', `serving ${dir.count} FABRICATED records (${dir.source})`,
      `These are offered to a clinician creating an athlete, and fill in name, IC,\n`
      + `        date of birth, sport and programme. Set AIRMS_ISN_DIRECTORY=none, or point\n`
      + `        it at an ISN export.`);
  } else {
    ok('ISN directory', `${dir.mode} — ${dir.count} record(s) (${dir.source})`);
  }

  // ── 5. The norms in force ─────────────────────────────────────────────────
  // The ruler. If it was computed over fabricated athletes then every real
  // athlete is scored against invented peers, and the band looks ordinary.
  const pinnedId = (await Setting.findOne({ where: { key: 'pinned_norm_version_id' } }))?.value ?? null;
  const versions = await CohortNormVersion.count();
  if (pinnedId && (demoUsers.length || fixtureRows.length)) {
    const v = await CohortNormVersion.findByPk(pinnedId, { attributes: ['id', 'label', 'createdAt'] });
    block('Norms in force', `a norm version is PINNED on a database holding fabricated data`,
      `"${v?.label ?? pinnedId}" would score real athletes against invented peers.\n`
      + `        Release the pin and recompute once real screenings are loaded.`);
  } else if (pinnedId) {
    warn('Norms in force', `version ${pinnedId} is pinned`,
      'Confirm it was computed over REAL screenings before going live.');
  } else if (versions > 0 && (demoUsers.length || fixtureRows.length)) {
    warn('Norms in force', `${versions} saved norm version(s) on a fabricated database`,
      'Delete them with the rest of the demo data; a restore would reinstate invented norms.');
  } else {
    ok('Norms in force', pinnedId ? `version ${pinnedId} pinned` : `no pin; ${versions} saved version(s)`);
  }

  // ── 6. The institutional trail ────────────────────────────────────────────
  // A WARNING, not a blocker: audit_logs is append-only by design and there is
  // no delete path anywhere, so this cannot be "fixed" without dropping the
  // table — which is a decision, not a remedy a script should imply.
  const auditTotal = await AuditLog.count();
  // Keyed on actorId: AuditLog deliberately COPIES the actor's name and role
  // onto the row rather than joining users, so there is no email to match on —
  // a trail that changes when somebody is renamed is not a trail (§20).
  const demoIds = demoUsers.map((u) => u.id);
  const demoAudit = demoIds.length
    ? await AuditLog.count({ where: { actorId: demoIds } }).catch(() => null)
    : 0;
  if (demoAudit === null) {
    warn('Audit trail', `${auditTotal} row(s); could not attribute them`,
      'The actor column differs from this check’s expectation — inspect by hand.');
  } else if (demoAudit > 0) {
    warn('Audit trail', `${demoAudit} of ${auditTotal} row(s) were written by demo accounts`,
      'Append-only by design, so these cannot be deleted selectively. Starting from an\n'
      + '        empty database is the only clean trail.');
  } else {
    ok('Audit trail', `${auditTotal} row(s), none from demo accounts`);
  }

  await sequelize.close();
}

const pad = (s, n) => String(s).padEnd(n);

main().then(() => {
  const blockers = results.filter((r) => r.level === 'block');
  const warns = results.filter((r) => r.level === 'warn');
  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  console.log('');
  for (const r of results) {
    const tag = r.level === 'ok' ? 'ok    ' : r.level === 'warn' ? 'WARN  ' : 'BLOCK ';
    console.log(`  ${tag}${pad(r.name, width)}${r.detail}`);
    if (r.remedy) console.log(`        ${' '.repeat(width)}${r.remedy}`);
  }
  console.log('');
  if (blockers.length) {
    console.log(`  NOT READY for real athlete data — ${blockers.length} blocker(s), ${warns.length} warning(s).\n`);
    process.exit(1);
  }
  console.log(`  Ready for real athlete data${warns.length ? ` — with ${warns.length} warning(s) to read` : ''}.\n`);
  process.exit(0);
}).catch((e) => {
  // Rule 2: a check that could not measure must never read as clean.
  console.error(`\n  COULD NOT CHECK — ${e.message}\n`);
  process.exit(2);
});
