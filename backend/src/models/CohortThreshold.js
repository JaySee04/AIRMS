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
  // Discipline/event (e.g. Men's Singles) — only set on the most-specific `spgd`
  // tier; null on every coarser tier. (B2)
  discipline: { type: DataTypes.STRING(64), allowNull: true },
  // Fallback tier this row represents: spgd = sport+programme+gender+discipline,
  // spg = sport+programme+gender, sg = sport+gender, s = sport, all = population.
  tier: { type: DataTypes.ENUM('spgd', 'spg', 'sg', 's', 'all'), allowNull: false },
  n: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // { component: { mean, sd } } for the composite inputs (see utils/cohortStats).
  stats: { type: DataTypes.JSON, allowNull: false },
  // Admin edits layered over the computed stats (same shape); null = use computed.
  overrides: { type: DataTypes.JSON, allowNull: true },
  // What the CURRENT data would produce, recorded while a norm version is PINNED.
  //
  // A pin freezes `stats` so athlete scores stay on one institutional baseline for
  // a season. That is the point of it, and also its danger: a held norm silently
  // goes stale as new screenings land. So recompute keeps calculating and parks
  // the answer here instead of overwriting `stats` — the admin can see exactly how
  // far the pin has drifted from reality and decide when to release it. Null when
  // nothing is pinned (there is nothing to compare against; `stats` IS current).
  freshStats: { type: DataTypes.JSON, allowNull: true, field: 'fresh_stats' },
  freshN: { type: DataTypes.INTEGER, allowNull: true, field: 'fresh_n' },
  freshAt: { type: DataTypes.DATE, allowNull: true, field: 'fresh_at' },
  // A cohort that first appeared AFTER the pin was set. It cannot be in the
  // pinned snapshot, so it is stored live — otherwise its athletes would have no
  // norm at all and could not be scored. Flagged so the UI never implies the pin
  // covers it.
  addedSincePin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'added_since_pin' },
  status: { type: DataTypes.ENUM('pending', 'approved'), allowNull: false, defaultValue: 'pending' },
  computedAt: { type: DataTypes.DATE, allowNull: true, field: 'computed_at' },
  approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
  approvedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'approved_by' },
}, {
  tableName: 'cohort_thresholds',
  underscored: true,
  indexes: [
    { unique: true, fields: ['sport', 'programme', 'gender', 'discipline', 'tier'] },
  ],
});

module.exports = CohortThreshold;
