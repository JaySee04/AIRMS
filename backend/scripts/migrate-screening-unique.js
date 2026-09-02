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

const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

const INDEX = 'screenings_athlete_assessed_unique';

(async () => {
  const target = `${process.env.MYSQL_USER || 'root'}@${process.env.MYSQL_HOST || 'localhost'}`
    + `:${process.env.MYSQL_PORT || 3306}/${process.env.MYSQL_DATABASE || 'airms'}`;
  console.log(`target : ${target}`);
  console.log(`ssl    : ${process.env.MYSQL_SSL === '1' ? 'required' : 'off'}\n`);

  await sequelize.authenticate();

  const existing = await sequelize.query(
    'SHOW INDEX FROM `screenings` WHERE Key_name = ?',
    { replacements: [INDEX], type: QueryTypes.SELECT },
  );
  if (existing.length) {
    console.log(`✓ ${INDEX} is already present — nothing to do.`);
    process.exit(0);
  }

  const dupes = await sequelize.query(
    'SELECT athlete_id, assessed_at, COUNT(*) AS c FROM `screenings` '
    + 'GROUP BY athlete_id, assessed_at HAVING c > 1 ORDER BY c DESC',
    { type: QueryTypes.SELECT },
  );
  if (dupes.length) {
    console.error(`✗ ${dupes.length} duplicate group(s) already exist. NOT altering the table.\n`);
    dupes.slice(0, 20).forEach((d) => {
      console.error(`    athlete ${d.athlete_id}  assessed ${new Date(d.assessed_at).toISOString()}  x${d.c}`);
    });
    console.error('\n  Resolve these first — keep the row you want and delete the rest:');
    console.error('    SELECT id, athlete_id, assessed_at FROM screenings');
    console.error("      WHERE athlete_id = '<id>' AND assessed_at = '<ts>' ORDER BY id;");
    console.error('    DELETE FROM screenings WHERE id = <the ones to drop>;');
    console.error('\n  Then run this again.');
    process.exit(1);
  }
  console.log('✓ no duplicate (athlete_id, assessed_at) pairs — safe to add the index');

  await sequelize.query(
    `ALTER TABLE \`screenings\` ADD UNIQUE KEY \`${INDEX}\` (\`athlete_id\`, \`assessed_at\`)`,
  );

  const after = await sequelize.query(
    'SHOW INDEX FROM `screenings` WHERE Key_name = ?',
    { replacements: [INDEX], type: QueryTypes.SELECT },
  );
  if (!after.length) {
    console.error('✗ the ALTER reported success but the index is not there. Investigate before relying on it.');
    process.exit(1);
  }
  const cols = after.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map((r) => r.Column_name);
  console.log(`✓ created ${INDEX} on (${cols.join(', ')})`);
  console.log('\nRe-run this any time; it is idempotent.');
  process.exit(0);
})().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
