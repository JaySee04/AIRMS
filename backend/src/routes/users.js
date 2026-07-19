// Admin-only user management. Covers medical staff (per-feature permissions,
// opt-out model) and the coach role (one assigned sport). Both
// support toggling active status.
const express = require('express');
const { User } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { PERMISSION_KEYS, PERMISSION_LABELS, sanitizePermissions } = require('../utils/permissions');

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

// GET /api/users/permission-meta — the permission catalogue for the UI.
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

// POST /api/users — create a coach (name, email, password, coachSport). Only the
// coach role is creatable here; admins/medical/athletes come from seed/register.
router.post('/', async (req, res) => {
  try {
    const { name, email, password, coachSport } = req.body || {};
    const errors = [];
    if (!name || !String(name).trim()) errors.push('Name is required');
    if (!email || !String(email).trim()) errors.push('Email is required');
    if (!password || String(password).length < 6) errors.push('Password must be at least 6 characters');
    if (!coachSport || !String(coachSport).trim()) errors.push('Assigned sport is required');
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim(),
      password: String(password),
      role: 'coach',
      coachSport: String(coachSport).trim(),
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

    if (user.role === 'medical') {
      if (req.body.permissions !== undefined) user.permissions = sanitizePermissions(req.body.permissions);
    } else if (user.role === 'coach') {
      if (typeof req.body.coachSport === 'string') user.coachSport = req.body.coachSport.trim() || null;
    } else {
      return res.status(400).json({ message: 'Only medical staff and coaches are configurable.' });
    }
    if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;
    await user.save();

    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
