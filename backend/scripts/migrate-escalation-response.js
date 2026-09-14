// Add screenings.response_outcome / response_note / response_by / response_at.
//
// WHAT THEY RECORD (§103): what a clinician DID about an escalation. Before
// these existed, agreeing with a red band and acting on it left no
// institutional trace — only DISAGREEING did, via the override.
//
// SAFE TO RUN FIRST, and it must be. All four are nullable with no default, so
// a migrated database serves the OLD code unchanged: expand, then deploy. The
// reverse is not safe — the Screening model now SELECTS these columns, so every
// screening query against an unmigrated database dies with
// "Unknown column 'response_outcome' in 'field list'", taking out the roster,
// recompute and all four dashboards.
//
//   npm run migrate:escalation-response
//   npm run migrate:escalation-response -- --dry-run
//   npm run migrate:escalation-response -- --url "mysql://user:pass@host:12345/db" --ca ./ca.pem
//
// Idempotent: it reads information_schema and adds only what is missing, so a
// re-run on a migrated database is a no-op rather than an error.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const { Sequelize } = require('sequelize');
const { RESPONSE_OUTCOME_KEYS } = require('../src/shared/facts');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes('--dry-run');
const INSECURE = process.argv.includes('--insecure');

// The ENUM is rendered from the SHARED list, so the column, the route's
// validation and the picker on screen cannot drift. Quoted defensively even
// though these keys are ours: a migration that string-builds SQL should not
// depend on the caller having been careful.
const enumSql = RESPONSE_OUTCOME_KEYS.map((k) => `'${String(k).replace(/'/g, "''")}'`).join(',');

const COLUMNS = [
  { name: 'response_outcome', ddl: `ADD COLUMN response_outcome ENUM(${enumSql}) NULL AFTER override_at` },
  { name: 'response_note', ddl: 'ADD COLUMN response_note TEXT NULL AFTER response_outcome' },
  { name: 'response_by', ddl: 'ADD COLUMN response_by VARCHAR(120) NULL AFTER response_note' },
  { name: 'response_at', ddl: 'ADD COLUMN response_at DATETIME NULL AFTER response_by' },
];

function connect() {
  const url = arg('url');
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      console.error('That --url is not parseable. A password containing @ : / # ? % must be');
      console.error('percent-encoded (@ -> %40, # -> %23, and so on).');
      process.exit(2);
    }
    const ca = arg('ca');
    const ssl = INSECURE
      ? { rejectUnauthorized: false }
      : (ca ? { ca: fs.readFileSync(ca), rejectUnauthorized: true } : undefined);
    // The target, password removed. Running a migration against the wrong
    // database is the mistake worth making loud.
    console.log(`target: ${parsed.hostname}:${parsed.port || 3306}${parsed.pathname}`);
    return new Sequelize(url, { logging: false, dialectOptions: ssl ? { ssl } : {} });
  }
  console.log(`target: ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT || 3306}/${process.env.MYSQL_DATABASE}`);
  return new Sequelize(
    process.env.MYSQL_DATABASE,
    process.env.MYSQL_USER,
    process.env.MYSQL_PASSWORD,
    {
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT) || 3306,
      dialect: 'mysql',
      logging: false,
      dialectOptions: process.env.MYSQL_SSL === '1'
        ? { ssl: { ca: fs.readFileSync(process.env.MYSQL_SSL_CA), rejectUnauthorized: true } }
        : {},
    },
  );
}

async function main() {
  const db = connect();
  await db.authenticate();

  const [existing] = await db.query(
    "SELECT column_name AS n FROM information_schema.columns "
    + "WHERE table_schema = DATABASE() AND table_name = 'screenings'",
  );
  const have = new Set(existing.map((r) => r.n || r.COLUMN_NAME));

  const missing = COLUMNS.filter((c) => !have.has(c.name));
  if (!missing.length) {
    console.log('\nAll four response columns already exist — nothing to do.');
    await db.close();
    return;
  }

  console.log(`\nmissing: ${missing.map((c) => c.name).join(', ')}`);
  const sql = `ALTER TABLE screenings\n  ${missing.map((c) => c.ddl).join(',\n  ')};`;
  console.log(`\n${sql}\n`);

  if (DRY) {
    console.log('--dry-run: nothing was applied.');
    await db.close();
    return;
  }

  await db.query(sql);

  // Verify rather than assume. An ALTER that reports no error and leaves the
  // column absent is exactly the silent failure this codebase keeps writing
  // guards against.
  const [after] = await db.query(
    "SELECT column_name AS n FROM information_schema.columns "
    + "WHERE table_schema = DATABASE() AND table_name = 'screenings'",
  );
  const now = new Set(after.map((r) => r.n || r.COLUMN_NAME));
  const stillMissing = COLUMNS.filter((c) => !now.has(c.name));
  if (stillMissing.length) {
    console.error(`FAILED: still missing ${stillMissing.map((c) => c.name).join(', ')}`);
    await db.close();
    process.exit(1);
  }

  console.log('applied, and verified present:');
  for (const c of COLUMNS) console.log(`  screenings.${c.name}`);
  await db.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
