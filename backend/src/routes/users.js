// Admin-only user management. Currently scoped to medical staff: list them and
// configure their per-feature permissions (opt-out model) and active status.
const express = require('express');
const { User } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { PERMISSION_KEYS, PERMISSION_LABELS, sanitizePermissions } = require('../utils/permissions');

const router = express.Router();

// All routes here require an authenticated admin.
router.use(auth, rbac('admin'));

// GET /api/users/permission-meta — the permission catalogue for the UI.
router.get('/permission-meta', (_req, res) => {
  res.json({ keys: PERMISSION_KEYS, labels: PERMISSION_LABELS });
});

// GET /api/users?role=medical — list users (defaults to medical staff).
router.get('/', async (req, res) => {
  try {
    const role = req.query.role || 'medical';
    const rows = await User.findAll({
      where: { role },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'permissions', 'lastLoginAt', 'createdAt'],
    });
    res.json(rows.map((u) => ({ ...u.get({ plain: true }), _id: String(u.id) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/users/:id — update a medical staffer's permissions and/or active
// status. Body: { permissions?: {key:bool}, isActive?: bool }.
router.patch('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'medical') {
      return res.status(400).json({ message: 'Only medical staff permissions are configurable.' });
    }

    if (req.body.permissions !== undefined) {
      user.permissions = sanitizePermissions(req.body.permissions);
    }
    if (typeof req.body.isActive === 'boolean') {
      user.isActive = req.body.isActive;
    }
    await user.save();

    const plain = user.get({ plain: true });
    delete plain.password;
    delete plain.resetTokenHash;
    delete plain.resetTokenExpiresAt;
    delete plain.resetCodeAttempts;
    res.json({ ...plain, _id: String(user.id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
