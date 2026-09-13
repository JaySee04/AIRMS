// Drop the two redundant indexes `npm run verify:schema` reports, safely and
// twice-runnable.
//
//   cd backend
//   npm run migrate:drop-redundant-indexes            # backend/.env (local)
//   npm run migrate:drop-redundant-indexes -- --url "mysql://user:pass@host:12345/db" --ca ./ca.pem
//   npm run migrate:drop-redundant-indexes -- --dry-run
//
// WHAT AND WHY
//
//   screenings.screenings_athlete_id_assessed_at  (athlete_id, assessed_at)
//     A non-unique index on EXACTLY the columns of
//     `screenings_athlete_assessed_unique`. The model declares only the unique
//     one: this is a leftover from before §45 introduced it, never dropped from
//     databases that already existed. A fresh `npm run seed` does not create it,
//     so the development machine and a new clone had different schemas — the
//     kind of difference that makes "works here" mean nothing.
//
//   athlete_disciplines.athlete_disciplines_athlete_id  (athlete_id)
//     A strict prefix of the unique key on (athlete_id, discipline), so InnoDB
//     can already satisfy `WHERE athlete_id = ?` from that key. Declared in the
//     MODEL, so every database has it; the declaration was removed in the same
//     change and this drops it from databases already built.
//
// NEITHER IS A PERFORMANCE FIX, and this script does not claim to be one. At 74
// screenings and 22 discipline rows the saving is unmeasurable. They are removed
// because an index is a statement about how a table is read, and both of these
// state something untrue — which is what the next person sizing these tables
// would act on.
//
// SAFETY
//
//   * It drops an index ONLY after re-deriving that it is redundant from
//     information_schema — never from the name alone. If the covering index is
//     missing, it refuses and says so, because dropping then would remove real
//     coverage.
//   * Idempotent: an already-dropped index is reported as such and skipped.
//   * --dry-run prints the exact statements and changes nothing.
//   * It prints the target host (password removed) before doing anything.
//     Running a migration against the wrong database is the mistake worth
//     making loud.
//
// EXIT CODES  0 done or nothing to do · 1 refused · 2 could not run
require('dotenv').config({ quiet: true });

const { QueryTypes, Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

// Each entry names the index to drop and the index that must EXIST and COVER it
// for the drop to be safe. Covering means: same columns, or this one's columns
// are a leftmost prefix of the cover's.
const TARGETS = [
  {
    table: 'screenings',
    drop: 'screenings_athlete_id_assessed_at',
    coveredBy: 'screenings_athlete_assessed_unique',
  },
  {
    table: 'athlete_disciplines',
    drop: 'athlete_disciplines_athlete_id',
    coveredBy: 'athlete_disciplines_athlete_id_discipline',
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

  const rows = await sequelize.query(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS name,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = :db
      GROUP BY TABLE_NAME, INDEX_NAME`,
    { replacements: { db: dbName }, type: QueryTypes.SELECT },
  );
  const find = (t, name) => rows.find((r) => r.t === t && r.name === name);

  let dropped = 0;
  let refused = 0;
  for (const target of TARGETS) {
    const victim = find(target.table, target.drop);
    if (!victim) {
      console.log(`  skip     ${target.table}.${target.drop} — not present (already dropped, or never created)`);
      continue;
    }
    const cover = find(target.table, target.coveredBy);
    if (!cover) {
      console.log(`  REFUSED  ${target.table}.${target.drop} — its covering index ${target.coveredBy} does not exist.`);
      console.log('           Dropping now would remove real coverage. Create the covering index first');
      console.log('           (npm run migrate:screening-unique, or npm run seed on a scratch database).');
      refused += 1;
      continue;
    }
    // Re-derive redundancy from the columns rather than trusting the names.
    const same = victim.cols === cover.cols;
    const prefix = cover.cols.startsWith(`${victim.cols},`);
    if (!same && !prefix) {
      console.log(`  REFUSED  ${target.table}.${target.drop} (${victim.cols}) is NOT covered by ${target.coveredBy} (${cover.cols}).`);
      console.log('           The schema is not what this migration was written for. Nothing dropped.');
      refused += 1;
      continue;
    }

    const sql = `ALTER TABLE \`${target.table}\` DROP INDEX \`${target.drop}\``;
    if (dryRun) {
      console.log(`  would    ${sql}   -- covered by ${target.coveredBy} (${cover.cols})`);
      continue;
    }
    await sequelize.query(sql);
    const after = await sequelize.query(
      `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :t AND INDEX_NAME = :i`,
      { replacements: { db: dbName, t: target.table, i: target.drop }, type: QueryTypes.SELECT },
    );
    if (Number(after[0].n) !== 0) {
      console.log(`  FAILED   ${target.table}.${target.drop} still present after the ALTER.`);
      refused += 1;
      continue;
    }
    console.log(`  dropped  ${target.table}.${target.drop}  (covered by ${target.coveredBy})`);
    dropped += 1;
  }

  console.log(`\n${dryRun ? 'would drop' : 'dropped'}: ${dryRun ? TARGETS.filter((t) => find(t.table, t.drop)).length : dropped}, refused: ${refused}`);
  if (!dryRun && !refused) console.log('Re-check with: npm run verify:schema');
  await sequelize.close();
  process.exit(refused ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
