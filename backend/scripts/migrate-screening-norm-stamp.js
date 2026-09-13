// Add screenings.norm_version_id + screenings.scored_at, safely and twice-runnable.
//
//   cd backend
//   npm run migrate:norm-stamp                 # backend/.env (local)
//   npm run migrate:norm-stamp -- --dry-run
//   npm run migrate:norm-stamp -- --url "mysql://user:pass@host:12345/db" --ca ./ca.pem
//
// WHY THIS EXISTS (DESIGN_DECISIONS §96)
//
// `recomputeIndicators()` rescores only each athlete's LATEST screening, so an
// older row keeps the band it was given the last time it WAS the latest. For
// the athlete's own record that is right — a verdict formed in August was formed
// in August. For the admin band-mix trend it is not: the chart compares periods,
// and if the periods were scored under different norms it is comparing rulers
// while claiming to compare time.
//
// Measured on the live database before this was written:
//
//   2026 Q2   18 rows last scored 2026-08-23   +   21 rows scored 2026-09-10
//   2026 Q3   35 rows                              all scored 2026-09-10
//   pinned norm version "Pre-viva baseline 2026-08-25" created 2026-08-24
//
// i.e. the pin was created BETWEEN the two Q2 groups, and the chart drew the
// difference as athlete change. Nothing anywhere said otherwise.
//
// WHAT THE COLUMNS MEAN
//
//   norm_version_id  the pinned CohortNormVersion in force when the band was
//                    computed. NULL is NOT "missing" — it means the band was
//                    scored against live, unpinned norms, which is exactly the
//                    state that cannot be proven comparable to anything.
//   scored_at        when that happened. Disambiguates two different unpinned
//                    epochs, which would otherwise both read NULL.
//
// EXISTING ROWS ARE LEFT NULL ON PURPOSE. Back-filling them would mean inventing
// provenance for verdicts whose provenance is genuinely unknown — the precise
// failure (a fabricated value that looks like a real one) this project exists to
// avoid. A period containing them is reported UNKNOWN, not assumed comparable.
// The first `npm run seed` or recompute stamps everything it touches.
//
// SAFETY
//   * Idempotent — each column is added only if absent, and reported if present.
//   * --dry-run prints the exact statements and changes nothing.
//   * Verifies each column exists afterwards and fails loudly if not.
//   * Prints the target host (password removed) first.
//
// EXIT CODES  0 done or nothing to do · 1 verification failed · 2 could not run
require('dotenv').config({ quiet: true });

const { QueryTypes, Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

const COLUMNS = [
  {
    name: 'norm_version_id',
    ddl: 'ADD COLUMN `norm_version_id` INT NULL AFTER `cohort_deltas`',
    why: 'the pinned norm version the band was scored against (NULL = live/unpinned norms)',
  },
  {
    name: 'scored_at',
    ddl: 'ADD COLUMN `scored_at` DATETIME NULL AFTER `norm_version_id`',
    why: 'when the band was computed',
  },
];

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const urlArg = argOf('url');
const caArg = argOf('ca');
const insecure = argv.includes('--insecure');
const dryRun = argv.includes('--dry-run');

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

const sequelize = connect();

(async () => {
  let dbName;
  if (urlArg) {
    let u;
    try {
      u = new URL(urlArg);
    } catch {
      console.error(
        'Could not parse --url. A managed-database password containing @ : / # ? or %\n'
        + 'must be percent-encoded (@ -> %40, # -> %23, / -> %2F, : -> %3A, ? -> %3F, % -> %25).',
      );
      process.exit(2);
    }
    dbName = u.pathname.replace(/^\//, '');
    console.log(`\nTarget: ${u.hostname}:${u.port || 3306}/${dbName} as ${u.username}`);
  } else {
    dbName = sequelize.config.database;
    console.log(`\nTarget: ${sequelize.config.host}:${sequelize.config.port || 3306}/${dbName} as ${sequelize.config.username}`);
  }
  if (dryRun) console.log('DRY RUN — nothing will be changed.');
  console.log('');

  const present = async () => {
    const rows = await sequelize.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'screenings'`,
      { replacements: { db: dbName }, type: QueryTypes.SELECT },
    );
    return new Set(rows.map((r) => r.c));
  };

  let have = await present();
  const missing = COLUMNS.filter((c) => !have.has(c.name));

  if (!missing.length) {
    console.log('  Both columns already present — nothing to do.');
  } else {
    for (const col of missing) {
      const sql = `ALTER TABLE \`screenings\` ${col.ddl}`;
      if (dryRun) { console.log(`  would    ${sql}   -- ${col.why}`); continue; }
      await sequelize.query(sql);
      console.log(`  added    screenings.${col.name}  -- ${col.why}`);
    }
    for (const col of COLUMNS.filter((c) => have.has(c.name))) {
      console.log(`  skip     screenings.${col.name} — already present`);
    }
  }

  if (!dryRun && missing.length) {
    have = await present();
    const stillMissing = COLUMNS.filter((c) => !have.has(c.name)).map((c) => c.name);
    if (stillMissing.length) {
      console.error(`\nFAILED: ${stillMissing.join(', ')} absent after the ALTER.`);
      await sequelize.close();
      process.exit(1);
    }
  }

  // What the data looks like now — so the operator sees that existing rows are
  // deliberately unstamped rather than wondering whether the migration half ran.
  if (!dryRun) {
    const [row] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              SUM(scored_at IS NULL) AS unstamped
         FROM screenings`,
      { type: QueryTypes.SELECT },
    );
    console.log(`\n  ${row.unstamped} of ${row.total} screenings are unstamped (expected — existing rows are`);
    console.log('  NOT back-filled, because their provenance is genuinely unknown). The next');
    console.log('  recompute or `npm run seed` stamps everything it scores.');
    console.log('\nRe-check with: npm run verify:schema');
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(2); });
