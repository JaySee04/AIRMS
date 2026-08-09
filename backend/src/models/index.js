// Wires up associations between the Sequelize models. Import this once at
// server bootstrap so the models are registered before any queries run.
const { sequelize } = require('../config/db');

const User = require('./User');
const Athlete = require('./Athlete');
const MuscleFlag = require('./MuscleFlag');
const AthleteDiscipline = require('./AthleteDiscipline');
const Screening = require('./Screening');
const Setting = require('./Setting');
const CohortThreshold = require('./CohortThreshold');
const CohortNormVersion = require('./CohortNormVersion');
const AuditLog = require('./AuditLog');

// Athlete ↔ MuscleFlag (1:N) — athleteId is a VARCHAR FK: its values are the
// athlete’s IC number (A2, 2026-08-04), not a synthetic integer.
Athlete.hasMany(MuscleFlag, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'muscleFlags' });
MuscleFlag.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

// Athlete ↔ AthleteDiscipline (1:N) — the events an athlete competes in.
Athlete.hasMany(AthleteDiscipline, { foreignKey: 'athleteId', sourceKey: 'athleteId', as: 'disciplines' });
AthleteDiscipline.belongsTo(Athlete, { foreignKey: 'athleteId', targetKey: 'athleteId' });

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
  AthleteDiscipline,
  Screening,
  Setting,
  CohortThreshold,
  CohortNormVersion,
  AuditLog,
};
