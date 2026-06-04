const jwt = require('jsonwebtoken');
const { User } = require('../models-sql');

// Sequelize variant of middleware/auth.js. Same contract: sets req.user to
// the User row (without the password column) so RBAC + downstream routes
// can read req.user.role / req.user.athleteId identically to the Mongo path.
module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
