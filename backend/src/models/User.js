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
    // 'executive' is a READ-ONLY oversight role: the admin analytics and the PDF
    // reports, and nothing that writes. See middleware/rbac.js.
    type: DataTypes.ENUM('athlete', 'medical', 'admin', 'coach', 'executive'),
    allowNull: false,
  },
  athleteId: {
    type: DataTypes.STRING(16),
    allowNull: true,
    field: 'athlete_id',
  },
  // The single sport a coach is assigned to. A coach sees only athletes in this
  // sport (see routes/coach.js); null means the coach sees no athletes until an
  // admin assigns one. One-sport-per-coach is a deliberate rule — a coach's
  // jurisdiction is exactly one squad. Coach is a first-class 4th role (FYP II —
  // promoted 2026-07-19 from the earlier experimental spike).
  coachSport: {
    type: DataTypes.STRING(64),
    allowNull: true,
    defaultValue: null,
    field: 'coach_sport',
  },
  // Per-user feature toggles for medical staff (opt-out model — null means all
  // capabilities granted). Stored as JSON { key: boolean }; see
  // utils/permissions.js for the key list and enforcement helper.
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  // Per-user email opt-out, same opt-out shape as `permissions` above: null means
  // every notification this role can receive is on. Only the opt-OUTs are stored
  // ({ digest: false }), so a notification added later defaults to on rather than
  // inheriting a stale `true`. See utils/mailPrefs.js — the institution-wide admin
  // settings still gate whether AIRMS sends the mail at all.
  notifyPrefs: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    field: 'notify_prefs',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  // Invitation state. An invited account exists and is `isActive`, but nobody
  // — including the administrator who created it — knows its password: it is
  // minted random and discarded. The invitee sets the first one they, and only
  // they, will know, using the same one-time code the reset flow uses.
  //
  // Both columns are recorded rather than a single boolean because the useful
  // administrative question is not "is this pending" but "who have we invited
  // and never heard back from, and how long ago" — the answer to which decides
  // whether to chase somebody or re-send. `activatedAt` staying null while
  // `invitedAt` recedes into the past IS the signal.
  //
  // Null on both means an account created before this existed, or seeded: it
  // has a password somebody chose directly, and no invitation was ever sent.
  invitedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invited_at',
  },
  activatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'activated_at',
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
