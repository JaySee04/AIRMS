// Add the UNIQUE key on screenings(athlete_id, assessed_at), safely and twice-runnable.
//
//   cd backend
//   npm run migrate:screening-unique              # uses backend/.env  (local)
//   MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=airms \
//     MYSQL_SSL=1 MYSQL_SSL_CA=./ca.pem npm run migrate:screening-unique   # hosted
//
// WHY THIS EXISTS
//
// `npm run seed` creates the index from the model, so a fresh database has it.
// An existing one does not, and the LOCAL database was migrated on 2026-09-02
// while the hosted Aiven database was not — there are no Aiven credentials on
// the development machine and the Vercel CLI is logged out, so it could not be
// reached from here.
//
// The index matters because a duplicate screening is not a loud failure
// downstream. It reads as a RETEST with a difference of zero on every score,
// which deflates the typical error and can push the reliability engine over
// MIN_PAIRS into reporting a derived detectable-change threshold it has not
// earned (DESIGN_DECISIONS §45). Two duplicate commits were measured taking the
// dead band from the documented fallback of 2 to a derived 5.7-11.5.
//
// routes/upload.js already refuses to create a duplicate — it updates the
// existing row instead — so this closes only the millisecond window between
// that check and the insert, which no application-level check can close. Both
// layers are wanted; neither replaces the other.
//
// SAFETY
//
//   * It REFUSES to alter anything if duplicates already exist, and prints them.
//     An ALTER that fails halfway through on a production table during demo
//     preparation is precisely what this avoids.
//   * It is idempotent: run twice and the second run reports the index already
//     present and changes nothing.
//   * It never drops, rewrites or reorders data.
//   * NULL assessed_at is exempt by MySQL's own rule that NULLs are distinct in
//     a unique index — which is the behaviour wanted, since an undated screening
//     matches nothing and must always insert.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { QueryTypes, Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

const INDEX = 'screenings_athlete_assessed_unique';

// ── connecting somewhere other than backend/.env ────────────────────────────
//
// The hosted database is the one that needs this, and its credentials are not
// on the development machine. Assembling five MYSQL_* variables on a command
// line is exactly the sort of thing that gets half-done, so a single connection
// string is accepted instead — the kind a managed-database console hands out
// ready to paste:
//
//   npm run migrate:screening-unique -- --url "mysql://user:pass@host:12345/defaultdb"
//
// Aiven requires TLS and signs with a project CA, so pass the certificate
// offered on the same page:
//
//   ... --url "mysql://..." --ca ./ca.pem
//
// --insecure skips certificate verification. It is offered because a one-off
// migration from a trusted machine is a defensible use, and refusing outright
// would only push somebody towards a worse workaround — but the server is then
// unauthenticated, so prefer --ca whenever the file is to hand.
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const urlArg = argOf('url');
const caArg = argOf('ca');
const insecure = argv.includes('--insecure');

function connect() {
  const dialectOptions = { decimalNumbers: true };
  if (caArg) {
    // eslint-disable-next-line global-require
    dialectOptions.ssl = { ca: require('fs').readFileSync(caArg, 'utf8'), rejectUnauthorized: true };
  } else if (insecure) {
    dialectOptions.ssl = { rejectUnauthorized: false };
  } else if (process.env.MYSQL_SSL === '1') {
    dialectOptions.ssl = process.env.MYSQL_SSL_CA
      ? { ca: process.env.MYSQL_SSL_CA, rejectUnauthorized: true }
      : { rejectUnauthorized: true };
  }
  if (urlArg) {
    return new Sequelize(urlArg, {
      dialect: 'mysql', dialectModule: mysql2, logging: false, dialectOptions,
    });
  }
  // eslint-disable-next-line global-require
  return require('../src/config/db').sequelize;
}

const { applyScreeningUniqueIndex } = require('../src/utils/screeningUniqueIndex');

const sequelize = connect();

(async () => {
  // Print WHERE this is about to run, password removed. Running a migration
  // against the wrong database is the mistake worth making loud.
  let target;
  if (urlArg) {
    let u;
    try {
      u = new URL(urlArg);
    } catch {
      // Managed-database passwords routinely contain @ : / # ? and %, every one
      // of which means something inside a URL. This is the first thing anybody
      // hits, and "Invalid URL" on its own does not say why.
      console.error('✗ That --url could not be parsed.\n');
      console.error('  A password containing @ : / # ? or % must be percent-encoded:');
      console.error('    node -e "console.log(encodeURIComponent(process.argv[1]))" \'YOUR_PASSWORD\'');
      console.error('  then paste the result in place of the password.\n');
      console.error('  Or skip the URL entirely and pass the parts as environment variables:');
      console.error('    MYSQL_HOST=… MYSQL_PORT=… MYSQL_USER=… MYSQL_PASSWORD=… MYSQL_DATABASE=… \\');
      console.error('      MYSQL_SSL=1 MYSQL_SSL_CA="$(cat ca.pem)" npm run migrate:screening-unique');
      process.exit(1);
    }
    target = `${u.username}@${u.hostname}:${u.port || 3306}${u.pathname}`;
  } else {
    target = `${process.env.MYSQL_USER || 'root'}@${process.env.MYSQL_HOST || 'localhost'}`
      + `:${process.env.MYSQL_PORT || 3306}/${process.env.MYSQL_DATABASE || 'airms'}`;
  }
  let tls = process.env.MYSQL_SSL === '1' ? 'required' : 'off';
  if (caArg) tls = 'verified against the supplied CA';
  else if (insecure) tls = 'ENCRYPTED BUT NOT VERIFIED (--insecure)';
  console.log(`target : ${target}`);
  console.log(`ssl    : ${tls}\n`);

  await sequelize.authenticate();

  // The migration itself lives in src/utils/screeningUniqueIndex.js, so this
  // script and the API run the SAME function rather than two descriptions of
  // it. A migration with two implementations is how one environment ends up
  // with an index the other only thinks it has — which is exactly the position
  // this project was in until 2026-09-04, when the hosted database turned out
  // never to have had it.
  const result = await applyScreeningUniqueIndex(sequelize);

  if (result.status === 'already-present') {
    console.log(`✓ ${result.index} is already present — nothing to do.`);
    process.exit(0);
  }

  if (result.status === 'refused') {
    console.error(`✗ ${result.duplicates.length} duplicate group(s) already exist. NOT altering the table.\n`);
    result.duplicates.slice(0, 20).forEach((d) => {
      console.error(`    athlete ${d.athleteId}  assessed ${new Date(d.assessedAt).toISOString()}  x${d.count}`);
    });
    console.error('\n  Resolve these first — keep the row you want and delete the rest:');
    console.error('    SELECT id, athlete_id, assessed_at FROM screenings');
    console.error("      WHERE athlete_id = '<id>' AND assessed_at = '<ts>' ORDER BY id;");
    console.error('    DELETE FROM screenings WHERE id = <the ones to drop>;');
    console.error('\n  Then run this again.');
    process.exit(1);
  }

  console.log('✓ no duplicate (athlete_id, assessed_at) pairs — safe to add the index');
  console.log(`✓ created ${result.index} on (${result.columns.join(', ')})`);
  console.log('\nRe-run this any time; it is idempotent.');
  process.exit(0);
})().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
