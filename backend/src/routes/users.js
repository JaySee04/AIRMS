// Admin-only user management. Covers medical staff (per-feature permissions,
// opt-out model) and the coach role (one assigned sport). Both
// support toggling active status.
const express = require('express');
const { User } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { PERMISSION_KEYS, PERMISSION_LABELS, sanitizePermissions } = require('../utils/permissions');
const { validatePassword } = require('../utils/passwordPolicy');
const { recordAudit } = require('../utils/audit');
const { sendMail, buildInviteEmail } = require('../utils/mailer');
const { issueCode, INVITE_CODE_TTL_MIN, RESET_CODE_MAX_ATTEMPTS } = require('../utils/resetCodes');
const crypto = require('crypto');

// Roles an administrator may create. `athlete` is deliberately absent: athlete
// accounts are not part of this deployment's onboarding (JC, 2026-08-23), and
// creating one would also need a roster record to attach it to, which is a
// different decision from "who may use the system".
const INVITABLE_ROLES = ['medical', 'coach', 'admin', 'executive'];

// The site an invitation points at. Env rather than derived from the request:
// the invitee's link must go to the web app, and the API is on a different
// origin — deriving it from Host would send people to the API domain, where
// there is no activation page.
const siteUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || null;

// Send (or re-send) an invitation. Mutates and SAVES the user.
//
// The password set here is random and immediately discarded: an invited account
// must be unusable until its owner chooses a credential, and the administrator
// who created it must not be able to sign in as them. That is the whole reason
// this flow exists rather than an admin typing a password and texting it over.
async function sendInvite(user, req, { creating = false } = {}) {
  if (creating) user.password = crypto.randomBytes(32).toString('hex');
  const code = issueCode(user, { ttlMinutes: INVITE_CODE_TTL_MIN });
  user.invitedAt = new Date();
  await user.save();

  const mail = buildInviteEmail({
    code,
    name: user.name,
    role: user.role === 'medical' ? 'medical staff' : user.role,
    invitedBy: req.user?.name || null,
    expiresInDays: Math.round(INVITE_CODE_TTL_MIN / (60 * 24)),
    maxAttempts: RESET_CODE_MAX_ATTEMPTS,
    siteUrl: siteUrl(),
  });
  // Awaited, unlike the reset mail: an administrator pressing "invite" needs to
  // know whether it actually went. A reset can be fire-and-forget because the
  // user is present and will simply ask again; nobody is watching an invitation
  // fail.
  await sendMail({ to: user.email, ...mail });
  return code;
}

const router = express.Router();

// All routes here require an authenticated admin.
router.use(auth, rbac('admin'));

// Strip secret columns before returning a user instance.
function publicUser(user) {
  const plain = user.get({ plain: true });
  delete plain.password;
  delete plain.resetTokenHash;
  delete plain.resetTokenExpiresAt;
  delete plain.resetCodeAttempts;
  return { ...plain, _id: String(user.id) };
}

router.get('/permission-meta', (_req, res) => {
  res.json({ keys: PERMISSION_KEYS, labels: PERMISSION_LABELS });
});

// GET /api/users?role=medical — list users (defaults to medical staff).
// `coachSport` is included so the coach-management UI can show each assignment.
router.get('/', async (req, res) => {
  try {
    const role = req.query.role || 'medical';
    const rows = await User.findAll({
      where: { role },
      order: [['name', 'ASC']],
      // invitedAt/activatedAt are listed explicitly: this is an allow-list, so a
      // column added to the model is invisible here until named. The personnel
      // page needs them to distinguish 'invited three weeks ago, never
      // responded' from 'never signed in', which are different problems.
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'permissions', 'coachSport', 'lastLoginAt', 'createdAt', 'invitedAt', 'activatedAt'],
    });
    res.json(rows.map((u) => ({ ...u.get({ plain: true }), _id: String(u.id) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users — create a staff account: a coach (needs an assigned sport)
// or a medical staffer (full permissions by default, opt-out model). Admins and
// athletes still come from seed/register, not this endpoint.
// POST /api/users — create a coach, medical, admin or executive account.
//
// Two ways in, and the difference matters:
//
//   * WITH a password — the administrator sets it and must convey it to the
//     person somehow. Retained because it is how every existing account was
//     made and how a demo account is minted, but it means a credential travels
//     out of band and the administrator knows it.
//
//   * WITHOUT one (`invite: true`) — the account is created with a random
//     password nobody ever sees, and the person receives a one-time code to set
//     their own. This is the path for real people: the only password that ever
//     exists is the one its owner chose.
router.post('/', async (req, res) => {
  try {
    const {
      name, email, password, role, coachSport, invite,
    } = req.body || {};
    const wantRole = INVITABLE_ROLES.includes(role) ? role : null;
    const wantInvite = Boolean(invite) || !password;
    const errors = [];
    if (!wantRole) errors.push(`Role must be one of: ${INVITABLE_ROLES.join(', ')}`);
    if (!name || !String(name).trim()) errors.push('Name is required');
    if (!email || !String(email).trim()) errors.push('Email is required');
    // An invited account needs no password from the administrator; one set by
    // hand still faces the SAME policy as a user-chosen one, so an admin-minted
    // account cannot be the weak one.
    if (!wantInvite) {
      const pwError = validatePassword(String(password));
      if (pwError) errors.push(pwError);
    }
    if (wantRole === 'coach' && (!coachSport || !String(coachSport).trim())) errors.push('A coach needs an assigned sport');
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      // Replaced immediately by sendInvite when inviting; a value is needed here
      // because the column is NOT NULL and the model hashes on save.
      password: wantInvite ? crypto.randomBytes(32).toString('hex') : String(password),
      role: wantRole,
      coachSport: wantRole === 'coach' ? String(coachSport).trim() : null,
    });

    let invited = false;
    if (wantInvite) {
      try {
        await sendInvite(user, req, { creating: true });
        invited = true;
      } catch (err) {
        // The account exists but the invitation did not arrive, and saying so is
        // the difference between an administrator re-sending and an administrator
        // waiting for a person who was never contacted. The account is left in
        // place rather than rolled back so the invite can simply be re-sent.
        return res.status(201).json({
          ...publicUser(user),
          invited: false,
          inviteError: err.message,
          message: 'Account created, but the invitation email could not be sent. Use Resend invite.',
        });
      }
    }

    // Who was given access to the system, and by whom. Creating an account is
    // the act that makes every later action by that account possible, so a trail
    // that records the actions but not the granting has a hole at the start of
    // it. The password is not touched here and never reaches the log.
    recordAudit(req, {
      action: 'user.create',
      entity: 'user',
      entityId: user.id,
      summary: `Created ${wantRole} account for ${user.name} (${user.email})${invited ? ' and sent an invitation' : ''}`,
      meta: {
        role: wantRole, email: user.email, coachSport: user.coachSport || null, invited,
      },
    });
    res.status(201).json({ ...publicUser(user), invited });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A user with that email already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

// POST /api/users/:id/invite — send or re-send an activation code.
//
// Also usable on an account that already has a password: it mints a new code
// and the old one dies, which is what "I never got it" and "it expired" both
// need. It does NOT clear the existing password, so a working account stays
// usable while its owner decides whether to bother.
router.post('/:id/invite', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isActive) return res.status(409).json({ message: 'That account is deactivated. Reactivate it before inviting.' });

    await sendInvite(user, req);
    recordAudit(req, {
      action: 'user.invite',
      entity: 'user',
      entityId: user.id,
      summary: `Sent an activation code to ${user.name} (${user.email})`,
      meta: { role: user.role, email: user.email, resend: Boolean(user.activatedAt) },
    });
    res.json({ ...publicUser(user), invited: true });
  } catch (err) {
    res.status(502).json({ message: `Could not send the invitation: ${err.message}` });
  }
});

// PATCH /api/users/:id — configure a medical staffer (permissions/isActive) or a
// coach (coachSport/isActive). Body shape depends on the target's role.
router.patch('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Snapshot before the mutation so the log can say what actually changed
    // rather than only what the final state is. "Account changed" with no
    // subject is an entry nobody can act on.
    const before = { permissions: user.permissions, coachSport: user.coachSport, isActive: user.isActive };

    if (user.role === 'medical') {
      if (req.body.permissions !== undefined) user.permissions = sanitizePermissions(req.body.permissions);
    } else if (user.role === 'coach') {
      if (typeof req.body.coachSport === 'string') user.coachSport = req.body.coachSport.trim() || null;
    } else {
      return res.status(400).json({ message: 'Only medical staff and coaches are configurable.' });
    }
    if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;
    await user.save();

    const changes = [];
    if (before.isActive !== user.isActive) changes.push(user.isActive ? 'reactivated' : 'deactivated');
    if (before.coachSport !== user.coachSport) changes.push(`sport ${before.coachSport || 'none'} → ${user.coachSport || 'none'}`);
    if (JSON.stringify(before.permissions) !== JSON.stringify(user.permissions)) changes.push('permissions updated');
    // A PATCH that changed nothing is not an event. Logging it would pad the
    // trail — and the staff activity counts drawn from it — with no-ops.
    if (changes.length) {
      recordAudit(req, {
        action: 'user.update',
        entity: 'user',
        entityId: user.id,
        summary: `${user.name} (${user.role}): ${changes.join('; ')}`,
        meta: { role: user.role, changes, isActive: user.isActive },
      });
    }

    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
