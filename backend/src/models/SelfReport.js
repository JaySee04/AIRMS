const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Mirrors backend/src/models/SelfReport.js. Intentionally less constrained
// than Injury: bodyPart/injuryType are free-form strings (athletes submit
// raw descriptions that the medical reviewer normalises before promotion).
const SelfReport = sequelize.define('SelfReport', {
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
  athleteName: { type: DataTypes.STRING(120), allowNull: true, field: 'athlete_name' },
  sport: { type: DataTypes.STRING(64), allowNull: true },

  bodyPart: { type: DataTypes.STRING(64), allowNull: false, field: 'body_part' },
  side: {
    type: DataTypes.ENUM('Left', 'Right', 'Both', 'N/A'),
    defaultValue: 'N/A',
  },
  injuryType: { type: DataTypes.STRING(64), allowNull: true, field: 'injury_type' },
  severity: { type: DataTypes.ENUM('Minor', 'Moderate', 'Severe'), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },

  status: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
    defaultValue: 'Pending',
  },
  reviewNote: { type: DataTypes.TEXT, allowNull: true, field: 'review_note' },
  reviewedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'reviewed_by' },
  reviewedAt: { type: DataTypes.DATE, allowNull: true, field: 'reviewed_at' },
}, {
  tableName: 'self_reports',
  underscored: true,
  indexes: [
    { fields: ['athlete_id'] },
    { fields: ['status'] },
  ],
});

module.exports = SelfReport;
