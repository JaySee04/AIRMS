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
    { fields: ['athlete_id'] },
    // One row per (athlete, discipline) — re-adding the same event is a no-op.
    { unique: true, fields: ['athlete_id', 'discipline'] },
  ],
});

module.exports = AthleteDiscipline;
