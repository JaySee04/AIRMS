const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db-sql');

// Single table for both myodynamia (weakness) and tension flags.
// In Mongo these were two parallel sub-document arrays on Athlete;
// relational design collapses them into one table discriminated by `flagType`.
const MuscleFlag = sequelize.define('MuscleFlag', {
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
  flagType: {
    type: DataTypes.ENUM('myodynamia', 'tension'),
    allowNull: false,
    field: 'flag_type',
  },
  muscle: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  side: {
    type: DataTypes.ENUM('L', 'R', 'B'),
    allowNull: false,
  },
}, {
  tableName: 'muscle_flags',
  underscored: true,
  indexes: [
    { fields: ['athlete_id', 'flag_type'] },
  ],
});

module.exports = MuscleFlag;
