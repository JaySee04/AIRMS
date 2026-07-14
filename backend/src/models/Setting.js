const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Admin-tunable knobs (key/value). Per the redesign spec §3.3 — the minimum
// cohort size, fallback behaviour, escalation toggles, and alert toggles are
// settings, not hardcoded constants. Defaults live in utils/settings.js.
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING(64), primaryKey: true },
  value: { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'settings',
  underscored: true,
});

module.exports = Setting;
