const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Append-only record of who changed what, for work transparency.
//
// Answers "who imported this screening?", "who moved this norm?", "who marked
// this athlete injured?" — questions the data itself shows only the result of.
//
// Deliberately NOT a foreign key to users: the actor's name and role are COPIED
// in at write time. A trail that changes when someone is renamed or deleted is
// not a trail — it must say who they were when they acted, not who they are.
//
// There is no update or delete path anywhere in the app. Rows are written and
// read, never edited.
const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  // Actor, as they were at the moment of the action.
  actorId: { type: DataTypes.INTEGER, allowNull: true, field: 'actor_id' },
  actorName: { type: DataTypes.STRING(120), allowNull: true, field: 'actor_name' },
  actorRole: { type: DataTypes.STRING(32), allowNull: true, field: 'actor_role' },

  // What happened. `action` is a stable dotted key meant for filtering
  // ('screening.import', 'norm.restore'); `summary` is the human sentence shown
  // in the UI, written at the call site where the context is actually known.
  action: { type: DataTypes.STRING(64), allowNull: false },
  entity: { type: DataTypes.STRING(32), allowNull: true },
  entityId: { type: DataTypes.STRING(64), allowNull: true, field: 'entity_id' },
  summary: { type: DataTypes.STRING(500), allowNull: true },

  // Anything structured worth keeping — token usage for an import, the before
  // and after of a norm edit. Free-form so adding a field never needs a
  // migration; never rendered blindly, only read by the page that wrote it.
  meta: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'audit_logs',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['created_at'] },
    { fields: ['action'] },
    { fields: ['actor_id'] },
  ],
});

module.exports = AuditLog;
