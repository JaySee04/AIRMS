const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User } = require('../models');
const authMiddleware = require('../middleware/auth');
const { sendMail, buildResetEmail } = require('../utils/mailer');
const { validatePassword } = require('../utils/passwordPolicy');
const { prefsForUser, sanitizePrefs } = require('../utils/mailPrefs');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Reset-OTP + verification-token helpers. The 6-digit code is generated with
// crypto.randomInt so it's cryptographically uniform across the 0–999999
// space; only the SHA-256 hash of the code is stored. Brute force across the
// 1M code space is mitigated by RESET_CODE_MAX_ATTEMPTS: the code is
// invalidated after 5 wrong entries.
//
// After the OTP is verified the same hash column holds a 32-byte verification
// token issued back to the client, with a shorter TTL (long enough to type a
// password) gating the reset-password endpoint — so the OTP never travels in the
// reset payload. Generation, hashing and the attempt/TTL rules live in
// utils/resetCodes.js, shared exactly with the invitation flow.
const {
  generateResetCode, hashResetCode,
  RESET_CODE_TTL_MIN, RESET_CODE_MAX_ATTEMPTS,
  RESET_VERIFY_TOKEN_TTL_MIN, RESET_VERIFY_TOKEN_BYTES,
} = require('../utils/resetCodes');

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
      // Deliberately generic — the response is identical whether the email
      // doesn't exist or the password is wrong, so an attacker can't probe
      // for valid accounts. Wording is friendlier than a stock "Invalid
      // credentials" while preserving the no-enumeration property.
      return res.status(401).json({
        message: "That email and password don't match an active AIRMS account. Double-check both, or use Forgot password? if you can't remember it.",
      });
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
        permissions: user.permissions ?? null,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/forgot-password
// Issues a single-use 6-digit reset code and emails it to the user. Returns
// the same "if the email exists, a code has been sent" response in every case,
// so an attacker can't enumerate registered emails by probing this endpoint.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const genericResponse = {
      message: 'If an account exists for that email, a reset code has been sent.',
    };

    const user = await User.findOne({ where: { email } });
    // Bail out silently if the user doesn't exist or is deactivated. Always
    // return the generic response so the client never learns which case applied.
    if (!user || !user.isActive) return res.json(genericResponse);

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);

    user.resetTokenHash = hashResetCode(code);
    user.resetTokenExpiresAt = expiresAt;
    user.resetCodeAttempts = 0;
    await user.save();

    const mail = buildResetEmail({
      code,
      expiresInMinutes: RESET_CODE_TTL_MIN,
      maxAttempts: RESET_CODE_MAX_ATTEMPTS,
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

// POST /api/auth/verify-otp
// Verifies a 6-digit reset code. On success the OTP hash is replaced with a
// short-lived verification token that the client uses to call /reset-password.
// On failure the attempt counter increments and the code is invalidated after
// RESET_CODE_MAX_ATTEMPTS wrong entries.
router.post('/verify-otp', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const user = await User.scope('withResetToken').findOne({ where: { email } });
    if (!user || !user.isActive || !user.resetTokenHash || !user.resetTokenExpiresAt
        || user.resetTokenExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Reset code is invalid or has expired. Please request a new one.' });
    }

    const submittedHash = hashResetCode(String(code));
    if (submittedHash !== user.resetTokenHash) {
      user.resetCodeAttempts = (user.resetCodeAttempts || 0) + 1;
      const reached = user.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS;
      if (reached) {
        user.resetTokenHash = null;
        user.resetTokenExpiresAt = null;
      }
      await user.save();
      const remaining = Math.max(0, RESET_CODE_MAX_ATTEMPTS - user.resetCodeAttempts);
      return res.status(400).json({
        message: reached
          ? 'Too many incorrect attempts. The code has been invalidated — request a new one.'
          : `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before this code is invalidated.`,
      });
    }

    // Code matches — swap the OTP hash for a verification-token hash. The
    // raw token is returned to the client (held in sessionStorage) and used
    // by /reset-password to authorise the actual password rotation.
    const rawToken = crypto.randomBytes(RESET_VERIFY_TOKEN_BYTES).toString('hex');
    user.resetTokenHash = hashResetCode(rawToken);
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_VERIFY_TOKEN_TTL_MIN * 60 * 1000);
    user.resetCodeAttempts = 0;
    await user.save();

    res.json({
      verificationToken: rawToken,
      expiresInMinutes: RESET_VERIFY_TOKEN_TTL_MIN,
      message: 'Code verified. You may now set a new password.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password
// Sets a new password using a verification token previously obtained from
// /auth/verify-otp. Token is single-use and short-lived. Password is bcrypted
// by the User.beforeSave hook and must satisfy the system password policy.
router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { verificationToken, password } = req.body || {};
    if (!email || !verificationToken || !password) {
      return res.status(400).json({ message: 'Email, verification token, and new password are required' });
    }
    const policyError = validatePassword(password);
    if (policyError) {
      return res.status(400).json({ message: policyError });
    }

    const user = await User.scope('withResetToken').findOne({ where: { email } });
    if (!user || !user.isActive || !user.resetTokenHash || !user.resetTokenExpiresAt
        || user.resetTokenExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Your verification has expired. Please request a new code.' });
    }

    if (hashResetCode(String(verificationToken)) !== user.resetTokenHash) {
      return res.status(400).json({ message: 'Verification token is invalid. Please restart the password reset.' });
    }

    user.password = password;
    // First password an invited account has ever had: record that the
    // invitation was taken up. Only ever set once — a later reset is not a
    // re-activation, and overwriting it would destroy the one fact this column
    // exists to hold, which is when the person actually joined.
    if (user.invitedAt && !user.activatedAt) user.activatedAt = new Date();
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.resetCodeAttempts = 0;
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

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      athleteId: req.user.athleteId,
      permissions: req.user.permissions ?? null,
      createdAt: req.user.createdAt,
      lastLoginAt: req.user.lastLoginAt,
    },
  });
});

// ── Per-user email preferences ──────────────────────────────────────────────
// Deliberately on /auth and scoped to `req.user`: these are the caller's OWN
// preferences, so there is no id in the path and no way to address anybody
// else's. Silencing a colleague's clinical alerts would be a quietly serious
// thing to allow, and the safest way to not allow it is to have no route for it.
router.get('/notification-preferences', authMiddleware, (req, res) => {
  res.json({ preferences: prefsForUser(req.user) });
});

router.put('/notification-preferences', authMiddleware, async (req, res) => {
  try {
    // sanitizePrefs drops unknown keys and any key this role cannot receive, so a
    // crafted body cannot write junk into the column.
    const prefs = sanitizePrefs(req.body && req.body.preferences, req.user.role);
    await req.user.update({ notifyPrefs: prefs });
    res.json({ preferences: prefsForUser(req.user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
