// The (athlete_id, assessed_at) UNIQUE index migration, as a function.
//
// Extracted from scripts/migrate-screening-unique.js so the CLI and the
// admin endpoint run the SAME migration rather than two descriptions of it.
// A migration with two implementations is how one environment gets an index
// the other only thinks it has.
//
// Why the index exists (§45): a duplicate screening is not a loud failure
// downstream. It is a *retest with a difference of zero on every score*, which
// `consecutivePairs()` pairs like any other and which can push the reliability
// engine over MIN_PAIRS into claiming a DERIVED dead band it has not earned —
// the exact failure `reliability.js` exists to prevent, reached by inflating
// the numerator. The demo hands the same three reports to two people.
//
// NULL assessed_at is exempt, which is wanted: MySQL treats NULLs as distinct,
// so an undated screening matches nothing and always inserts.

const { QueryTypes } = require('sequelize');

const INDEX = 'screenings_athlete_assessed_unique';

/** Is the index already there? */
async function indexPresent(sequelize) {
  const rows = await sequelize.query(
    'SHOW INDEX FROM `screenings` WHERE Key_name = ?',
    { replacements: [INDEX], type: QueryTypes.SELECT },
  );
  return rows;
}

/** Rows that would violate the index if it were added now. */
async function duplicates(sequelize) {
  return sequelize.query(
    'SELECT athlete_id, assessed_at, COUNT(*) AS c FROM `screenings` '
    + 'GROUP BY athlete_id, assessed_at HAVING c > 1 ORDER BY c DESC',
    { type: QueryTypes.SELECT },
  );
}

/**
 * Apply the index. Idempotent, and REFUSES rather than half-applying.
 *
 * @returns {Promise<{status:string, index:string, columns?:string[], duplicates?:object[]}>}
 *   status is one of:
 *     'already-present' — nothing to do
 *     'refused'         — duplicates exist; they are named, nothing was altered
 *     'created'         — the index now exists, verified by reading it back
 */
async function applyScreeningUniqueIndex(sequelize) {
  if ((await indexPresent(sequelize)).length) {
    return { status: 'already-present', index: INDEX };
  }

  const dupes = await duplicates(sequelize);
  if (dupes.length) {
    // Naming them is the point: "it failed" leaves somebody guessing, and the
    // fix is a judgement about which row to keep, not something to automate.
    return {
      status: 'refused',
      index: INDEX,
      duplicates: dupes.map((d) => ({
        athleteId: d.athlete_id,
        assessedAt: d.assessed_at,
        count: Number(d.c),
      })),
    };
  }

  await sequelize.query(
    `ALTER TABLE \`screenings\` ADD UNIQUE KEY \`${INDEX}\` (\`athlete_id\`, \`assessed_at\`)`,
  );

  // Read it back. An ALTER that reports success and leaves no index would be a
  // migration everybody believes ran.
  const after = await indexPresent(sequelize);
  if (!after.length) {
    const e = new Error('the ALTER reported success but the index is not there');
    e.expose = true;
    throw e;
  }
  return {
    status: 'created',
    index: INDEX,
    columns: after.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map((r) => r.Column_name),
  };
}

module.exports = { INDEX, applyScreeningUniqueIndex, indexPresent, duplicates };
