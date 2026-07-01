// Feature-permission middleware. Layers on top of auth + rbac: the route still
// declares which roles may reach it, and this gate additionally enforces the
// admin-configured per-user toggles for MEDICAL staff only. admin/athlete are
// passed through untouched (their access is RBAC-governed).
//
// Usage: router.get('/', auth, rbac('medical','admin'), requirePermission('viewRecords'), handler)
const { hasPermission } = require('../utils/permissions');

module.exports = (key) => (req, res, next) => {
  if (!hasPermission(req.user, key)) {
    return res.status(403).json({ message: 'Access denied: this feature has been disabled for your account by an administrator.' });
  }
  next();
};
