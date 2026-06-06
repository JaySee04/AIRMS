const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db-sql');

// Mirrors backend/src/models/Athlete.js. The 8 risk indicators are flattened
// to columns (Mongoose nested them under `risks`); the API serialiser
// reassembles the nested shape so the frontend reads the same response shape.
// myodynamia[] and tension[] are normalised into the muscle_flags table.
const Athlete = sequelize.define('Athlete', {
  athleteId: {
    type: DataTypes.STRING(16),
    primaryKey: true,
    field: 'athlete_id',
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  age: { type: DataTypes.INTEGER, allowNull: true },
  gender: { type: DataTypes.ENUM('Male', 'Female'), allowNull: true },
  sex: { type: DataTypes.ENUM('M', 'F'), allowNull: true },
  weight: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  height: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  sport: { type: DataTypes.STRING(64), allowNull: false },
  program: {
    type: DataTypes.ENUM('PODIUM', 'PELAPIS', 'OTHERS'),
    allowNull: false,
  },

  overallActivityScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'overall_activity_score' },
  injuryRiskIndex: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'injury_risk_index' },
  mobility: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  stability: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  symmetry: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  exerciseRiskScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'exercise_risk_score' },

  neckInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'neck_injury_risk' },
  shoulderInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'shoulder_injury_risk' },
  scoliosis: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  spinalDiscHerniation: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'spinal_disc_herniation' },
  lumbarPelvisInjury: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'lumbar_pelvis_injury' },
  jointPain: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'joint_pain' },
  kneeInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'knee_injury_risk' },
  ankleInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'ankle_injury_risk' },

  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
}, {
  tableName: 'athletes',
  underscored: true,
  indexes: [
    { fields: ['sport'] },
    { fields: ['program'] },
    { fields: ['gender'] },
  ],
});

// Reassemble the nested `risks` object the Mongoose model exposed, so the
// frontend response shape stays identical across the two persistence layers.
Athlete.prototype.toJSONNested = function () {
  const plain = this.get({ plain: true });
  const {
    neckInjuryRisk, shoulderInjuryRisk, scoliosis, spinalDiscHerniation,
    lumbarPelvisInjury, jointPain, kneeInjuryRisk, ankleInjuryRisk,
    ...rest
  } = plain;
  return {
    ...rest,
    risks: {
      neckInjuryRisk: Number(neckInjuryRisk) || 0,
      shoulderInjuryRisk: Number(shoulderInjuryRisk) || 0,
      scoliosis: Number(scoliosis) || 0,
      spinalDiscHerniation: Number(spinalDiscHerniation) || 0,
      lumbarPelvisInjury: Number(lumbarPelvisInjury) || 0,
      jointPain: Number(jointPain) || 0,
      kneeInjuryRisk: Number(kneeInjuryRisk) || 0,
      ankleInjuryRisk: Number(ankleInjuryRisk) || 0,
    },
  };
};

module.exports = Athlete;
