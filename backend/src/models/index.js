// Wires up associations between the Sequelize models. Import this once at
// server bootstrap so the models are registered before any queries run.
const { sequelize } = require('../config/db');

const User = require('./User');
const Athlete = require('./Athlete');
const MuscleFlag = require('./MuscleFlag');
const Activity = require('./Activity');
const Injury = require('./Injury');
const SelfReport = require('./SelfReport');
const RecoveryBaseline = require('./RecoveryBaseline');
const Screening = require('./Screening');

// Athlete ↔ MuscleFlag (1:N) — using athleteId VARCHAR as the FK so the
// canonical "ATH0001" identifier stays the cross-table key.
Athlete.hasMany(MuscleFlag, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'muscleFlags' });
MuscleFlag.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

Athlete.hasMany(Activity, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'activities' });
Activity.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

Athlete.hasMany(Injury, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'injuries' });
Injury.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

Athlete.hasMany(SelfReport, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'selfReports' });
SelfReport.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

Athlete.hasMany(RecoveryBaseline, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'recoveryBaselines' });
RecoveryBaseline.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

// Athlete ↔ Screening (1:N) — full history of every committed HoloMotion import.
Athlete.hasMany(Screening, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'screenings' });
Screening.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

// User → Athlete is a soft link via User.athleteId (only populated when
// role='athlete'). Kept as a column rather than a strict FK to avoid
// forcing seed order issues.

module.exports = {
  sequelize,
  User,
  Athlete,
  MuscleFlag,
  Activity,
  Injury,
  SelfReport,
  RecoveryBaseline,
  Screening,
};
