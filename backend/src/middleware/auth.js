const jwt = require('jsonwebtoken');
const { User } = require('../models');

// THE SIGNING ALGORITHM IS PINNED, and this is defence in depth rather than a
// fix for a live hole.
//
// `jwt.verify(token, secret)` with no `algorithms` option accepts whatever the
// TOKEN's own header claims, filtered by the key type — and because the secret
// here is a string, jsonwebtoken 9 already restricts that to the HMAC family, so
// the classic `alg: none` and RS256-public-key-as-HMAC-secret confusions are not
// reachable today. What makes pinning worth one line is that the protection is a
// property of the KEY TYPE, not of this file: the day somebody moves JWT_SECRET
// to a PEM (a key file, a KMS handle, an asymmetric rotation), the implicit
// restriction changes underneath code that never mentioned it. Naming the
// algorithm means that change breaks loudly instead of widening what is accepted.
const JWT_ALGORITHMS = ['HS256'];

// JWT verify + populate req.user with the matching User row. RBAC + route
// handlers downstream read req.user.role / req.user.athleteId.
//
// The user row is RE-READ on every request rather than trusted from the token.
// That is what makes deactivation immediate: switching an account off ends its
// session on the next click instead of at token expiry, which is the property
// that matters when somebody leaves ISN.
module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: JWT_ALGORITHMS });
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

module.exports.JWT_ALGORITHMS = JWT_ALGORITHMS;
