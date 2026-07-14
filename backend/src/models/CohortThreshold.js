const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Cohort norms — the mean + SD per screening component for a (sport,
// programme, gender) group, used to z-score every athlete's screening (the
// "average threshold per sport/programme/gender" ask). Auto-computed on import
// as `pending`; the admin reviews/edits the pre-filled values and approves.
// The overall risk indicator only compares against `approved` rows.
// See redesign spec §3.2 and §6.
const CohortThreshold = sequelize.define('CohortThreshold', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sport: { type: DataTypes.STRING(64), allowNull: false },
  programme: { type: DataTypes.STRING(16), allowNull: true },
  gender: { type: DataTypes.STRING(8), allowNull: true },
  // Fallback tier this row represents: spg = sport+programme+gender,
  // sg = sport+gender, s = sport, all = whole population.
  tier: { type: DataTypes.ENUM('spg', 'sg', 's', 'all'), allowNull: false },
  n: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // { component: { mean, sd } } for the composite inputs (see utils/cohortStats).
  stats: { type: DataTypes.JSON, allowNull: false },
  // Admin edits layered over the computed stats (same shape); null = use computed.
  overrides: { type: DataTypes.JSON, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'approved'), allowNull: false, defaultValue: 'pending' },
  computedAt: { type: DataTypes.DATE, allowNull: true, field: 'computed_at' },
  approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
  approvedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'approved_by' },
}, {
  tableName: 'cohort_thresholds',
  underscored: true,
  indexes: [
    { unique: true, fields: ['sport', 'programme', 'gender', 'tier'] },
  ],
});

module.exports = CohortThreshold;
