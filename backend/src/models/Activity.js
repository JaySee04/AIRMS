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
  // Soft-delete: DELETE sets deleted_at instead of dropping the row, and
  // default queries auto-exclude soft-deleted rows. Preserves audit trail
  // without growing the dataset visibly. Pass { paranoid: false } on a
  // findAll call to retrieve including-deleted rows for audit/admin use.
  paranoid: true,
  indexes: [
    { fields: ['athlete_id', 'date'] },
  ],
  hooks: {
    beforeValidate: (activity) => {
      // sRPE: load = duration × intensity, computed at write time so the
      // value is always consistent with the inputs it was derived from.
      if (activity.duration != null && activity.intensity != null) {
        activity.load = Number(activity.duration) * Number(activity.intensity);
      }
    },
  },
});

module.exports = Activity;
