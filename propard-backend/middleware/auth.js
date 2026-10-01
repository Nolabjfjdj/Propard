const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'Accès refusé, token manquant' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const tokenSessionVersion = Number.isInteger(decoded.sessionVersion)
      ? decoded.sessionVersion
      : 0;

    const user = await User.findById(decoded.id).select('_id sessionVersion');

    if (!user || user.sessionVersion !== tokenSessionVersion) {
      return res.status(401).json({ error: 'Session expirée' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
