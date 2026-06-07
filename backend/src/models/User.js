const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(160),
    allowNull: false,
    unique: true,
    set(value) {
      this.setDataValue('email', String(value).trim().toLowerCase());
    },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('athlete', 'medical', 'admin'),
    allowNull: false,
  },
  athleteId: {
    type: DataTypes.STRING(16),
    allowNull: true,
    field: 'athlete_id',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  // Password-reset OTP state. The 6-digit code is stored as a SHA-256 hash
  // so a DB compromise doesn't leak any active codes. resetCodeAttempts
  // tracks failed entries — the code is invalidated after 5 wrong attempts
  // to make brute force against a 6-digit space infeasible. Fields kept
  // under their legacy `reset_token_*` column names to avoid a schema rename.
  resetTokenHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'reset_token_hash',
  },
  resetTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_token_expires_at',
  },
  resetCodeAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'reset_code_attempts',
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at',
  },
}, {
  tableName: 'users',
  underscored: true,
  defaultScope: {
    attributes: { exclude: ['password', 'resetTokenHash', 'resetTokenExpiresAt', 'resetCodeAttempts'] },
  },
  scopes: {
    withPassword: { attributes: { include: ['password'] } },
    withResetToken: { attributes: { include: ['resetTokenHash', 'resetTokenExpiresAt', 'resetCodeAttempts'] } },
  },
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
  },
});

User.prototype.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = User;
