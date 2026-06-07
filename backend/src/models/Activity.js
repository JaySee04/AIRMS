const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

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
    // sRPE: load = duration × intensity, computed at write time so the value
    // is always consistent with the inputs it was derived from. We hook BOTH
    // beforeValidate (so the field is populated before allowNull validation
    // runs on a fresh insert) AND beforeSave (so the value is recomputed and
    // explicitly marked dirty on every update — Sequelize's UPDATE field
    // set is locked in before beforeValidate, so a mutation there alone is
    // not persisted).
    beforeValidate: (activity) => {
      if (activity.duration != null && activity.intensity != null) {
        activity.load = Number(activity.duration) * Number(activity.intensity);
      }
    },
    beforeSave: (activity) => {
      if (activity.duration != null && activity.intensity != null) {
        const newLoad = Number(activity.duration) * Number(activity.intensity);
        if (activity.load !== newLoad) {
          activity.load = newLoad;
          activity.changed('load', true);
        }
      }
    },
  },
});

module.exports = Activity;
