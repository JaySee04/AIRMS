const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Mirrors backend/src/models/Injury.js. The denormalised athlete fields
// (athleteName, sport, gender, program, athleteAge) are kept on the row so
// the admin analytics aggregations can group/filter without joining.
const Injury = sequelize.define('Injury', {
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
  gender: { type: DataTypes.STRING(16), allowNull: true },
  program: { type: DataTypes.STRING(32), allowNull: true },
  athleteAge: { type: DataTypes.INTEGER, allowNull: true, field: 'athlete_age' },

  bodyPart: {
    type: DataTypes.ENUM('Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'),
    allowNull: false,
    field: 'body_part',
  },
  side: {
    type: DataTypes.ENUM('Left', 'Right', 'Both', 'N/A'),
    defaultValue: 'N/A',
  },
  injuryType: {
    type: DataTypes.ENUM('Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'),
    allowNull: false,
    field: 'injury_type',
  },
  severity: {
    type: DataTypes.ENUM('Minor', 'Moderate', 'Severe'),
    allowNull: false,
  },
  mechanism: {
    type: DataTypes.ENUM('Contact', 'Non-contact', 'Overuse', 'Recurrent'),
    allowNull: true,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  recoveryStatus: {
    type: DataTypes.ENUM('Recovering', 'Recovered', 'Chronic'),
    defaultValue: 'Recovering',
    field: 'recovery_status',
  },
  source: {
    type: DataTypes.ENUM('Medical Log', 'Athlete Self-Report'),
    defaultValue: 'Medical Log',
  },
  loggedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'logged_by' },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'injuries',
  underscored: true,
  indexes: [
    { fields: ['athlete_id'] },
    { fields: ['date'] },
    { fields: ['sport', 'program'] },
    { fields: ['body_part'] },
  ],
});

module.exports = Injury;
