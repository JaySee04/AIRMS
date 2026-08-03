const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// A saved snapshot of the whole cohort-norm set (B1). Lets an admin NAME a set of
// norms and RESTORE it later, after imports/edits have moved the live norms.
// `snapshot` is the array of cohort rows captured at save time — per cohort key
// (tier/sport/programme/gender) its n / stats / overrides / status. Restoring
// upserts those back onto the live cohort_thresholds and re-scores everyone.
const CohortNormVersion = sequelize.define('CohortNormVersion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  label: { type: DataTypes.STRING(120), allowNull: false },
  note: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.STRING(120), allowNull: true, field: 'created_by' },
  snapshot: { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'cohort_norm_versions',
  underscored: true,
});

module.exports = CohortNormVersion;
