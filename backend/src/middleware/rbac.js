// Role-based access control middleware.
// Usage: rbac('admin') or rbac('medical', 'admin')
//
// Roles: athlete · medical · admin · coach · executive
//
// `executive` is deliberately NOT a super-admin. It is a READ-ONLY oversight
// account for someone senior who needs the institutional picture and the
// reports but must not be able to change the data those reports are built
// from: no import, no norm edits, no roster or personnel changes, no settings,
// and no full-database export. It is additive to no other role — every
// endpoint it may reach names it explicitly.
module.exports = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: insufficient role' });
  }
  next();
};
