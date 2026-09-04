const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
// The column IS the enum. Defined from the shared source so a filter control or
// a seeder offering a value this column rejects cannot exist — that failure is
// silent at the top (an empty cohort that looks like nobody qualified) and loud
// only at the bottom.
const { GENDERS, PROGRAMMES } = require('../shared/facts');

// Athlete row. The 8 injury-risk indicators are flattened to columns; the
// API serialiser reassembles them into a nested `risks` object that the
// frontend consumes. myodynamia[] and tension[] flags live in the
// muscle_flags table and are joined in at serialisation time.
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
  gender: { type: DataTypes.ENUM(...GENDERS), allowNull: true },
  sex: { type: DataTypes.ENUM('M', 'F'), allowNull: true },
  weight: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  height: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  sport: { type: DataTypes.STRING(64), allowNull: false },
  program: {
    type: DataTypes.ENUM(...PROGRAMMES),
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

  // Injury status set by medical staff — SEPARATE from the green/amber/red risk
  // band (an athlete can be band-green but injured, or amber but not injured).
  // An injured athlete is auto-excluded from cohort-norm CALCULATION (they'd skew
  // the healthy reference distribution) but is still scored against it. (B4)
  isInjured: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_injured' },
  injuryNote: { type: DataTypes.TEXT, allowNull: true, field: 'injury_note' },
  injuryBy: { type: DataTypes.STRING(120), allowNull: true, field: 'injury_by' },
  injuryAt: { type: DataTypes.DATE, allowNull: true, field: 'injury_at' },

  // Admin manual opt-out from cohort-norm CALCULATION (e.g. a known-bad screening
  // or an athlete the admin doesn't want shaping the norm). Independent of injury.
  // Excluded athletes are still scored against the norm. (B3)
  normExcluded: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'norm_excluded' },
}, {
  tableName: 'athletes',
  underscored: true,
  indexes: [
    { fields: ['sport'] },
    { fields: ['program'] },
    { fields: ['gender'] },
  ],
});

// Convenience: produce the nested `risks` shape directly off the instance.
// The route serialiser does the same reshape inline; this is just for the
// rare case a route wants to emit a single athlete without going through it.
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
