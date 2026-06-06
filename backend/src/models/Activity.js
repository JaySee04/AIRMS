const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db-sql');

const Activity = sequelize.define('Activity', {
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
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('Strength', 'Endurance', 'Speed', 'Skill', 'Match', 'Recovery'),
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 10, max: 240 },
  },
  intensity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 10 },
  },
  load: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'activities',
  underscored: true,
  indexes: [
    { fields: ['athlete_id', 'date'] },
  ],
  hooks: {
    beforeValidate: (activity) => {
      // Mirrors the Mongoose pre-save hook: load = duration × intensity (sRPE).
      if (activity.duration != null && activity.intensity != null) {
        activity.load = Number(activity.duration) * Number(activity.intensity);
      }
    },
  },
});

module.exports = Activity;
