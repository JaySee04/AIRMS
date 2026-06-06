const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User } = require('../models');
const authMiddleware = require('../middleware/auth');
const { sendMail, buildResetEmail } = require('../utils/mailer');
const { validatePassword } = require('../utils/passwordPolicy');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Reset-token helpers. The raw token is what the user receives in their email
// (and submits back via the reset link); the SHA-256 hash is what we store in
// the database, so a DB compromise can't leak any active reset tokens.
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MIN = 60;
const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Need the password column on this query (it's excluded by defaultScope).
    const user = await User.scope('withPassword').findOne({
      where: { email: String(email).trim().toLowerCase() },
    });
    if (!user || !user.isActive || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        athleteId: user.athleteId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/forgot-password
// Issues a single-use reset token and emails a reset link. Returns the same
// "if the email exists, a link has been sent" response in every case, so an
// attacker can't enumerate registered emails by probing this endpoint.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const genericResponse = {
      message: 'If an account exists for that email, a password reset link has been sent.',
    };

    const user = await User.findOne({ where: { email } });
    // Bail out silently if the user doesn't exist or is deactivated. Always
    // return the generic response so the client never learns which case applied.
    if (!user || !user.isActive) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    user.resetTokenHash = hashResetToken(rawToken);
    user.resetTokenExpiresAt = expiresAt;
    await user.save();

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
    const resetUrl = `${frontendBase}/reset-password/${rawToken}`;
    const mail = buildResetEmail({
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_MIN,
    });

    // Fire-and-forget the send so the client response time doesn't depend on
    // the upstream SMTP latency. Failures still get logged to the server.
    sendMail({ to: user.email, ...mail }).catch((err) => {
      console.error('[forgot-password] mail send failed:', err.message);
    });

    res.json(genericResponse);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password
// Consumes a reset token. The token is single-use (cleared on success) and
// expires after RESET_TOKEN_TTL_MIN minutes. Password is bcrypted by the
// existing User.beforeSave hook.
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    const policyError = validatePassword(password);
    if (policyError) {
      return res.status(400).json({ message: policyError });
    }

    const hash = hashResetToken(String(token));
    const user = await User.scope('withResetToken').findOne({
      where: {
        resetTokenHash: hash,
        resetTokenExpiresAt: { [Op.gt]: new Date() },
      },
    });
    if (!user || !user.isActive) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    user.password = password; // bcrypt hashing happens in the model beforeSave hook
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await user.save();

    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/change-password
// In-place password change for an authenticated user. Requires the current
// password (so an unattended session can't be hijacked into rotating the
// password) and validates the new one against the same policy used by the
// email-reset flow.
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must differ from the current password' });
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      return res.status(400).json({ message: policyError });
    }

    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword; // bcrypt hashing via the model beforeSave hook
    // Any outstanding email-reset token is now stale; clear it.
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await user.save();

    res.json({ message: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me — verify token and return current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      athleteId: req.user.athleteId,
      createdAt: req.user.createdAt,
      lastLoginAt: req.user.lastLoginAt,
    },
  });
});

module.exports = router;
