// Rename a SEEDED DEMO account everywhere it was copied onto audit rows.
//
// WHY THIS EXISTS, and why it is not a hole in the audit design.
//
// `utils/audit.js` copies the actor's name and role ONTO each row rather than
// joining `users`, deliberately: a trail that changes when somebody is renamed
// or deleted is not a trail (§20). There is no update path anywhere in the
// application, and this script does not add one — it is a standalone,
// hand-run correction, and the running system's append-only property is
// untouched.
//
// What makes it legitimate here is WHO the row is about. The property protects
// accountability for a REAL person's REAL actions. These rows record probing
// and demo traffic performed by fabricated fixtures against fabricated
// athletes; "Datuk Executive" never existed, so there is no account of anyone's
// conduct being rewritten. Weighed against that: the old name was on 420 rows
// of the Activity Log, which is a screen shown to the stakeholder.
//
// It refuses to run against anything that is not plainly a demo fixture, and it
// verifies that the row COUNT is unchanged — a rename must never add or drop a
// row, and checking that is the difference between a correction and a rewrite.
//
//   node scripts/rename-demo-actor.js --from "Datuk Executive" --to "Executive Demo 01"
//   node scripts/rename-demo-actor.js --from "..." --to "..." --dry-run

require('dotenv').config({ quiet: true });
const { Op } = require('sequelize');
const { sequelize, AuditLog, User } = require('../src/models');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes('--dry-run');
const FROM = arg('from');
const TO = arg('to');

async function main() {
  if (!FROM || !TO) {
    console.error('usage: node scripts/rename-demo-actor.js --from "<old name>" --to "<new name>" [--dry-run]');
    process.exit(2);
  }

  // THE GUARD, and it FAILS CLOSED — which the first version did not.
  //
  // That version refused a name belonging to a non-demo User, and otherwise
  // proceeded. So a name that resolved to NO user account fell straight
  // through. Tested with "Adam Karim", who is an ATHLETE rather than a login:
  // no User row, no refusal, and it reported 255 summary rows it was ready to
  // rewrite — every "Opened Adam Karim's screening record" in the clinical
  // trail. Rewriting an athlete's name across audit summaries is precisely the
  // corruption this script's own preamble argues is unacceptable.
  //
  // So the rule is inverted: the name must POSITIVELY resolve to a seeded demo
  // login, and anything else is refused. An unresolvable name is now the
  // refused case rather than the permitted one.
  const DEMO_DOMAINS = /@(isn\.gov\.my|siswa\.um\.edu\.my)$|^poseidonapollo11(\+\w+)?@gmail\.com$/i;
  const holder = await User.findOne({
    where: { name: { [Op.in]: [FROM, TO] } },
    attributes: ['id', 'name', 'email'],
    raw: true,
  });
  if (!holder) {
    console.error(`Refusing: "${FROM}" does not resolve to a user account.`);
    console.error('Only a SEEDED DEMO LOGIN may be renamed here. A name that matches no');
    console.error('account may still appear in audit summaries as an ATHLETE — rewriting');
    console.error('those would corrupt the clinical trail. See the note at the top of the file.');
    process.exit(1);
  }
  if (!DEMO_DOMAINS.test(holder.email)) {
    console.error(`Refusing: "${holder.name}" <${holder.email}> is not a seeded demo account.`);
    console.error('This script is for demo fixtures only — see the note at the top of the file.');
    process.exit(1);
  }
  console.log(`subject: ${holder.name} <${holder.email}>  (seeded demo account)`);

  // An athlete sharing the name would still be caught in `summary` text, so the
  // subject is checked against the roster too. `isnDirectory.test.js` exists
  // because ISN names genuinely collide.
  const clash = await sequelize.query(
    'SELECT name FROM athletes WHERE name = :n LIMIT 1',
    { replacements: { n: FROM }, type: sequelize.QueryTypes.SELECT },
  );
  if (clash.length) {
    console.error(`\nRefusing: "${FROM}" is also an athlete on the roster.`);
    console.error('Renaming would rewrite their name inside clinical audit summaries.');
    process.exit(1);
  }

  const before = {
    total: await AuditLog.count(),
    actor: await AuditLog.count({ where: { actorName: FROM } }),
    summary: await AuditLog.count({ where: { summary: { [Op.like]: `%${FROM}%` } } }),
  };
  console.log(`\nbefore: ${before.actor} actor rows, ${before.summary} summary rows, ${before.total} rows total`);

  if (!before.actor && !before.summary) {
    console.log('nothing to do.');
    return;
  }
  if (DRY) {
    console.log('\n--dry-run: no changes written.');
    return;
  }

  await sequelize.query(
    'UPDATE audit_logs SET actor_name = :neu WHERE actor_name = :old',
    { replacements: { neu: TO, old: FROM } },
  );
  await sequelize.query(
    'UPDATE audit_logs SET summary = REPLACE(summary, :old, :neu) WHERE summary LIKE :like',
    { replacements: { neu: TO, old: FROM, like: `%${FROM}%` } },
  );

  const after = {
    total: await AuditLog.count(),
    actor: await AuditLog.count({ where: { actorName: FROM } }),
    summary: await AuditLog.count({ where: { summary: { [Op.like]: `%${FROM}%` } } }),
    renamed: await AuditLog.count({ where: { actorName: TO } }),
  };
  console.log(`after:  ${after.actor} actor rows, ${after.summary} summary rows, ${after.total} rows total`);

  if (after.actor || after.summary) {
    console.error('\nFAILED: the old name is still present.');
    process.exit(1);
  }
  // A rename that changes the row count is not a rename.
  if (after.total !== before.total) {
    console.error(`\nFAILED: row count moved ${before.total} -> ${after.total}.`);
    process.exit(1);
  }
  console.log(`\nrenamed ${before.actor} actor + ${before.summary} summary rows to "${TO}"; ${after.renamed} rows now carry it.`);
  console.log('row count unchanged — nothing was added or dropped.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
