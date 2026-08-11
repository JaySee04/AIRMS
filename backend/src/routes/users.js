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
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'permissions', 'coachSport', 'lastLoginAt', 'createdAt'],
    });
    res.json(rows.map((u) => ({ ...u.get({ plain: true }), _id: String(u.id) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users — create a staff account: a coach (needs an assigned sport)
// or a medical staffer (full permissions by default, opt-out model). Admins and
// athletes still come from seed/register, not this endpoint.
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, coachSport } = req.body || {};
    const wantRole = role === 'medical' ? 'medical' : role === 'coach' ? 'coach' : null;
    const errors = [];
    if (!wantRole) errors.push('Role must be "coach" or "medical"');
    if (!name || !String(name).trim()) errors.push('Name is required');
    if (!email || !String(email).trim()) errors.push('Email is required');
    // Enforce the SAME password policy as self-service change/reset — an
    // admin-minted account must not be weaker than one a user sets themselves.
    if (!password) errors.push('Password is required');
    else { const pwError = validatePassword(String(password)); if (pwError) errors.push(pwError); }
    if (wantRole === 'coach' && (!coachSport || !String(coachSport).trim())) errors.push('A coach needs an assigned sport');
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim(),
      password: String(password),
      role: wantRole,
      // Medical staff carry no sport; they default to full permissions (null →
      // everything granted under the opt-out model in utils/permissions).
      coachSport: wantRole === 'coach' ? String(coachSport).trim() : null,
    });
    // Who was given access to the system, and by whom. Creating an account is
    // the act that makes every later action by that account possible, so a trail
    // that records the actions but not the granting has a hole at the start of
    // it. The password is not touched here and never reaches the log.
    recordAudit(req, {
      action: 'user.create',
      entity: 'user',
      entityId: user.id,
      summary: `Created ${wantRole} account for ${user.name} (${user.email})`,
      meta: { role: wantRole, email: user.email, coachSport: user.coachSport || null },
    });
    res.status(201).json(publicUser(user));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A user with that email already exists.' });
    }
    res.status(400).json({ message: err.message });
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
