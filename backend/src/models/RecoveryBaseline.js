const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// RecoveryBaseline — snapshot of an athlete's pre-elevation training state,
// captured when their composite risk first transitions out of Low. Acts as
// a "return-to-play target" for medical staff: the personalised Low band
// (lowMin/lowMax) and the chronic load the athlete was sustaining give a
// concrete recovery yardstick. Resolved when the athlete returns to Low.
const RecoveryBaseline = sequelize.define('RecoveryBaseline', {
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
  snapshotAcwr: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'snapshot_acwr',
  },
  chronicLoad: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'chronic_load',
  },
  targetLowMin: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'target_low_min',
  },
  targetLowMax: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'target_low_max',
  },
  // Cls + label captured at trigger time so the display can show what
  // band the athlete was in when the baseline opened, even if the model
  // changes later.
  triggerCls: {
    type: DataTypes.ENUM('mod', 'high', 'under'),
    allowNull: false,
    field: 'trigger_cls',
  },
  triggerLevel: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'trigger_level',
  },
  // Comma-separated escalation factors. JSON.stringify would work too but
  // simple comma form keeps it readable in raw SQL inspection.
  factors: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Null while active; timestamp set when the athlete's composite risk
  // returns to Low (or Detraining).
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolved_at',
  },
}, {
  tableName: 'recovery_baselines',
  underscored: true,
  indexes: [
    { fields: ['athlete_id', 'resolved_at'] },
  ],
});

module.exports = RecoveryBaseline;
