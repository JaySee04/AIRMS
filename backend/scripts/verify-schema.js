// Compare the LIVE database's indexes against what the models declare.
//
//   cd backend
//   npm run verify:schema                      # backend/.env (local)
//   npm run verify:schema -- --url "mysql://user:pass@host:12345/db" --ca ./ca.pem
//
// READ-ONLY. It changes nothing; `migrate:drop-redundant-indexes` does that.
//
// WHY THIS EXISTS. Every other guard in this project checks the CODE — jest,
// `npm run map`, `npm run mutate`, `npm run audit:access` all read the source or
// drive a local process. The SCHEMA is different: it is state that lives in a
// database, and it drifts from the models in a way nothing here could see.
//
// It had already drifted, and this script is what found it (2026-09-13):
//
//   * `screenings` carried TWO indexes on identical columns —
//     `screenings_athlete_assessed_unique` (UNIQUE) and
//     `screenings_athlete_id_assessed_at` (non-unique). The model declares only
//     the first. The second is a leftover from before §45 replaced it, never
//     dropped from the already-existing database. A fresh `npm run seed` does
//     not create it, so a new clone and this machine had DIFFERENT schemas —
//     and every screening insert here was maintaining a second, pointless
//     B-tree.
//   * `athlete_disciplines` declares an index on `(athlete_id)` AND a unique one
//     on `(athlete_id, discipline)`. The first is a strict prefix of the second,
//     so it can never be the better choice for any query. That redundancy is in
//     the MODEL, so every database has it.
//
// Neither is a performance problem at this size — 74 screenings, 22 discipline
// rows — and this script does not pretend otherwise. They are reported because
// a schema that disagrees with its own models is the same class of fault as a
// stale SYSTEM_MAP: the code stops describing the system, and the next person to
// reason about it reasons about the wrong thing.
//
// WHAT IT DELIBERATELY DOES NOT REPORT: VARCHAR columns that are "too wide".
// InnoDB stores VARCHAR variable-length, so `varchar(120)` holding 28
// characters costs the same as `varchar(32)` holding 28 — the "unused %" that a
// naive audit prints is not space anybody can reclaim. Worse, the observed
// maxima come from FABRICATED seed data: the longest seeded athlete name is 28
// characters while the longest real name the project already holds, in
// `src/mock/isnDirectory.js`, is 37 ("Mohamed Elffie Danish Bin Khir Johari") —
// and a full Malaysian name with bin/binti chains runs longer still. Narrowing
// those columns would trade nothing for a truncation bug on real data.
//
// EXIT CODES  0 no findings · 1 findings · 2 could not run
// BEFORE anything that reads MYSQL_*: requiring ../src/models pulls in
// config/db, which reads the credentials at import time. dotenv resolves
// relative to CWD, so this script must be run from backend/ — which is what the
// npm script does.
require('dotenv').config({ quiet: true });

const { QueryTypes, Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

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

const models = require('../src/models');

const sequelize = connect();

/** Declared index fields resolved to their actual DB column names. */
function declaredIndexes(M) {
  const attrs = M.rawAttributes || {};
  const colOf = (f) => (attrs[f] && attrs[f].field) || f;
  return ((M.options && M.options.indexes) || []).map((i) => ({
    unique: !!i.unique,
    cols: (i.fields || []).map(colOf).join(','),
  }));
}

(async () => {
  const findings = [];
  const note = (kind, msg) => { findings.push({ kind, msg }); console.log(`  ${kind.padEnd(10)} ${msg}`); };

  const dbName = urlArg ? new URL(urlArg).pathname.replace(/^\//, '') : sequelize.config.database;
  console.log(`\nSchema check against ${sequelize.config.host}/${dbName}\n`);

  const rows = await sequelize.query(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = :db
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`,
    { replacements: { db: dbName }, type: QueryTypes.SELECT },
  );

  const live = new Map();
  for (const r of rows) {
    if (!live.has(r.t)) live.set(r.t, []);
    live.get(r.t).push({ name: r.name, unique: Number(r.nonUnique) === 0, cols: r.cols });
  }

  // 1. Redundant indexes IN THE DATABASE: identical column lists, or a
  //    non-unique index whose columns are a strict prefix of another's.
  console.log('1. redundant indexes in the database');
  let any = false;
  for (const [table, list] of live) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = 0; b < list.length; b += 1) {
        if (a === b) continue;
        const A = list[a];
        const B = list[b];
        if (A.cols === B.cols && A.name < B.name) {
          any = true;
          note('DUPLICATE', `${table}: ${A.name} and ${B.name} both index (${A.cols})`);
        } else if (!A.unique && B.cols.startsWith(`${A.cols},`)) {
          any = true;
          note('REDUNDANT', `${table}: ${A.name} (${A.cols}) is a prefix of ${B.name} (${B.cols})`);
        }
      }
    }
  }
  if (!any) console.log('   none');

  // 2. Drift: an index the database has and no model asks for, or vice versa.
  //    PRIMARY and attribute-level unique keys are skipped — Sequelize creates
  //    those from the column definition, not from `options.indexes`.
  console.log('\n2. drift between models and database');
  let drift = false;
  for (const M of Object.values(models)) {
    if (!M || typeof M !== 'function' || !M.tableName) continue;
    const table = M.tableName;
    const declared = declaredIndexes(M);
    const actual = (live.get(table) || []).filter((i) => i.name !== 'PRIMARY');
    const attrUnique = new Set(
      Object.entries(M.rawAttributes || {})
        .filter(([, a]) => a.unique)
        .map(([k, a]) => a.field || k),
    );

    // ONE-TO-ONE, not "does some declared index have these columns".
    //
    // The set-membership version reported `drift: none` on a database holding
    // TWO indexes over (athlete_id, assessed_at) against a model declaring ONE,
    // because both matched the same declaration and neither looked extra. Each
    // live index must consume a distinct declaration; whatever is left over on
    // either side is the drift.
    const unclaimed = declared.slice();
    for (const act of actual) {
      if (attrUnique.has(act.cols)) continue; // unique:true on the column itself
      const at = unclaimed.findIndex((d) => d.cols === act.cols);
      if (at >= 0) unclaimed.splice(at, 1);
      else {
        drift = true;
        note('EXTRA', `${table}.${act.name} (${act.cols}) exists in the database but no model declares it`);
      }
    }
    for (const d of unclaimed) {
      drift = true;
      note('MISSING', `${table} declares (${d.cols}) but the database has no such index`);
    }
  }
  if (!drift) console.log('   none');

  // 3. Redundancy declared in the MODELS themselves — present in every database,
  //    including a fresh one, so dropping it from a database is not enough.
  console.log('\n3. redundant indexes declared in the models');
  let modelRedundant = false;
  for (const M of Object.values(models)) {
    if (!M || typeof M !== 'function' || !M.tableName) continue;
    const declared = declaredIndexes(M);
    for (const a of declared) {
      for (const b of declared) {
        if (a === b) continue;
        if (!a.unique && b.cols.startsWith(`${a.cols},`)) {
          modelRedundant = true;
          note('MODEL', `${M.tableName}: declared (${a.cols}) is a prefix of declared (${b.cols})`);
        }
      }
    }
  }
  if (!modelRedundant) console.log('   none');

  // 4. COLUMN drift — the model declares a column the database does not have.
  //
  // Sections 1-3 compare INDEXES, which is what this script was written for. A
  // missing column is the more damaging drift and was invisible here until
  // 2026-09-22, when it took the hosted API down for six days:
  //
  //   migrate:norm-stamp added screenings.norm_version_id + scored_at locally
  //   and was never run against Aiven. Every path that selects the full column
  //   set answered 500 — /athletes/:id, /screenings/:id/full, /decisions, the
  //   holistic report — while every path with an explicit narrow attribute list
  //   answered 200, so the roster rendered and opening any athlete failed.
  //
  // CLAUDE.md had it recorded as applied, on a probe that ran against a build
  // predating the columns; a bare findByPk proves a column exists only if the
  // MODEL doing the selecting declares it. This section needs no such reasoning
  // — it asks information_schema directly.
  //
  // MISSING is the finding that matters. EXTRA (a column no model declares) is
  // reported too but is usually a retired field, harmless until someone writes
  // a migration that assumes it is gone.
  console.log('\n4. column drift between models and database');
  const colRows = await sequelize.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = :db`,
    { replacements: { db: dbName }, type: QueryTypes.SELECT },
  );
  const liveCols = new Map();
  for (const r of colRows) {
    if (!liveCols.has(r.t)) liveCols.set(r.t, new Set());
    liveCols.get(r.t).add(r.c);
  }

  let colDrift = false;
  for (const M of Object.values(models)) {
    if (!M || typeof M !== 'function' || !M.tableName) continue;
    const table = M.tableName;
    const actual = liveCols.get(table);
    // A model with no table in this database at all is a different (louder)
    // problem than drift, and sync/seed is what creates it. Say so once.
    if (!actual) {
      colDrift = true;
      note('NO TABLE', `${table} is declared by a model and does not exist in the database`);
      continue;
    }
    // VIRTUAL attributes are computed in JS and back no column, so they are not
    // drift when absent.
    const declared = Object.entries(M.rawAttributes || {})
      .filter(([, a]) => !(a.type && a.type.key === 'VIRTUAL'))
      .map(([k, a]) => a.field || k);

    for (const col of declared) {
      if (!actual.has(col)) {
        colDrift = true;
        note('MISSING', `${table}.${col} is declared by the model and absent from the database`);
      }
    }
    for (const col of actual) {
      if (!declared.includes(col)) {
        colDrift = true;
        note('EXTRA', `${table}.${col} exists in the database and no model declares it`);
      }
    }
  }
  if (!colDrift) console.log('   none');

  console.log(`\n${findings.length} finding(s)`);
  await sequelize.close();
  process.exit(findings.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
