#!/usr/bin/env node
// Create the FIRST administrator on an empty database.
//
//   cd backend
//   npm run bootstrap:admin -- --email "someone@isn.gov.my" --name "Dr Thung"
//
// WHY THIS HAS TO EXIST. AIRMS has no self-registration and will not have any
// (CLAUDE.md): an administrator creates every account, and the invitee sets the
// first password that ever really exists on it. That is a good model with one
// hole at the very beginning — somebody has to be the first administrator, and
// until 2026-09-22 the only thing that could make one was `npm run seed`.
//
// So a real deployment had two options and both were wrong:
//
//   1. Seed it — and the institution's live database now holds ~60 fabricated
//      athletes, demo screenings, and five accounts whose password is published
//      in the project documentation.
//   2. Do not seed — and the schema exists, no account does, nobody can sign
//      in, and there is no route by which anybody ever can. The system is
//      complete and unusable.
//
// This is option 3: one real account, no fixtures.
//
// NO PASSWORD IS SET, AND THAT IS THE POINT. The account is minted exactly the
// way `POST /api/users` mints one — a random password hashed and discarded
// unread, then a one-time code that the owner exchanges for a credential of
// their own at /activate. The person running this script cannot sign in as the
// administrator they just created.
//
// THE CODE IS PRINTED, NOT EMAILED. Every other invitation in the system goes
// by email, which is correct: it proves the address. This one cannot rely on
// that, because a fresh install very often has no SMTP configured yet — and an
// invitation that silently fails to send, for the ONE account that can create
// all the others, is a locked institution. The operator is standing at the
// console; handing them the code directly is both simpler and stronger.
//
// REFUSES ON A POPULATED DATABASE. If any user exists this exits without
// writing. It is a bootstrap, not a back door: a script that could mint an
// administrator on a live system would undo the entire access model, and it
// would be the most attractive thing in the repository to anyone who got as far
// as the server.

require('dotenv').config({ quiet: true });

const { sequelize, User } = require('../src/models');
const { unusablePassword } = require('../src/utils/invite');
const { issueCode, INVITE_CODE_TTL_MIN, RESET_CODE_MAX_ATTEMPTS } = require('../src/utils/resetCodes');

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const force = argv.includes('--force-second-admin');

function die(msg, code = 1) {
  console.error(`\n${msg}\n`);
  process.exit(code);
}

(async () => {
  const email = (argOf('email') || '').trim().toLowerCase();
  const name = (argOf('name') || '').trim();

  if (!email || !name) {
    die([
      'Usage:',
      '  npm run bootstrap:admin -- --email "you@isn.gov.my" --name "Your Name"',
      '',
      'Creates the first administrator on an EMPTY database and prints a one-time',
      'activation code. No password is set; the account owner chooses one at',
      '/activate. Refuses if any user already exists.',
    ].join('\n'));
  }

  // The same shape check the User model applies, so this cannot create a row
  // the application would consider malformed (DD 97.1 — the address was
  // unvalidated for months and "not-an-email" would have been stored).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    die(`"${email}" does not look like an email address.`);
  }

  try {
    await sequelize.authenticate();
  } catch (err) {
    die([
      `Could not connect to MySQL: ${err.message}`,
      '',
      'Check MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE in backend/.env,',
      'and that the database exists and the server is running.',
    ].join('\n'), 2);
  }

  // Tables must already exist. Creating them here would duplicate what
  // sequelize.sync() does and is the sort of second definition that drifts.
  try {
    await User.findOne();
  } catch (err) {
    die([
      `The users table is not queryable: ${err.message}`,
      '',
      'Create the schema first, once, with:',
      '  cd backend; $env:SQL_SYNC=1; npm start      # then stop it with Ctrl-C',
      '',
      'That builds every table from the models. Do NOT use `npm run seed` on a real',
      'installation — it drops the database and inserts fabricated demo data.',
    ].join('\n'), 2);
  }

  const existing = await User.count();
  if (existing > 0 && !force) {
    die([
      `This database already has ${existing} user account(s), so it is not a fresh install.`,
      '',
      'This script is a bootstrap, not a way to add administrators. Create further',
      'accounts from Admin -> Personnel inside the application, which records who',
      'created whom in the audit trail — something this script cannot do, because',
      'there is no signed-in actor to attribute it to.',
      '',
      'If you have genuinely lost every administrator, re-run with --force-second-admin.',
    ].join('\n'));
  }

  if (existing > 0 && force) {
    console.warn(`\nWARNING: --force-second-admin on a database with ${existing} existing user(s).`);
    console.warn('This is a recovery path. The new account will not be attributed to anybody.\n');
  }

  const clash = await User.findOne({ where: { email } });
  if (clash) die(`An account already exists for ${email}.`);

  const user = User.build({
    name,
    email,
    // Hashed by the model's beforeSave hook and never shown to anyone,
    // including the person running this script.
    password: unusablePassword(),
    role: 'admin',
    isActive: true,
    invitedAt: new Date(),
  });

  // The same one-time code the invitation flow issues, with the same TTL, from
  // the same module — so this cannot drift into being weaker than an ordinary
  // invitation without that module changing for everybody.
  const code = issueCode(user, { ttlMinutes: INVITE_CODE_TTL_MIN });
  await user.save();

  const site = (process.env.FRONTEND_URL || '').split(',')[0].trim() || 'http://localhost:3000';
  const hours = Math.round(INVITE_CODE_TTL_MIN / 60);

  console.log('');
  console.log('  Administrator created.');
  console.log('');
  console.log(`    name           ${name}`);
  console.log(`    email          ${email}`);
  console.log('    role           admin');
  console.log('');
  console.log('  ACTIVATION CODE');
  console.log('');
  console.log(`      ${code}`);
  console.log('');
  console.log(`  Go to ${site}/activate, enter that email and code, and choose a password.`);
  console.log(`  The code is valid for ${hours} hours, can be used once, and allows`);
  console.log(`  ${RESET_CODE_MAX_ATTEMPTS} attempts. No password exists on the account until then, so nobody`);
  console.log('  — including whoever ran this script — can sign in as this person.');
  console.log('');
  console.log('  If it expires, the ordinary "Forgot password" flow works on this account');
  console.log('  and issues a fresh code, provided SMTP is configured.');
  console.log('');

  await sequelize.close();
  process.exit(0);
})().catch(async (err) => {
  console.error(`\nbootstrap:admin failed: ${err.message}\n`);
  try { await sequelize.close(); } catch { /* already closing */ }
  process.exit(1);
});
