const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Events an athlete competes in, as a join table (an athlete can hold more than
// one — a badminton player may play both Men's Singles and Men's Doubles). Only
// sports that HAVE events populate this; most sports leave an athlete with zero
// rows. The discipline label is a plain string validated against the per-sport
// catalogue on the client (frontend/src/lib/disciplines.ts); kept free-form at
// the DB layer so adding a sport's events needs no migration.
const AthleteDiscipline = sequelize.define('AthleteDiscipline', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  athleteId: {
    type: DataTypes.STRING(16),
    allowNull: false,
    field: 'athlete_id',
  },
  discipline: {
    type: DataTypes.STRING(48),
    allowNull: false,
  },
}, {
  tableName: 'athlete_disciplines',
  underscored: true,
  indexes: [
    // One row per (athlete, discipline) — re-adding the same event is a no-op.
    //
    // This ALSO serves every lookup by athlete alone. A separate
    // `{ fields: ['athlete_id'] }` stood here until 2026-09-13 and was strictly
    // redundant: athlete_id is the leftmost column of this key, so InnoDB can
    // already use it for `WHERE athlete_id = ?` — the extra index could never be
    // the better choice for any query, while still being written on every
    // insert, update and delete.
    //
    // Not a performance problem at 22 rows, and it is not removed as one. It is
    // removed because a redundant index is a claim about the access pattern that
    // is not true, and the next person sizing this table would believe it.
    // Found by `npm run verify:schema`; dropped from existing databases by
    // `npm run migrate:drop-redundant-indexes`.
    { unique: true, fields: ['athlete_id', 'discipline'] },
  ],
});

module.exports = AthleteDiscipline;
