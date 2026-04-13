const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Récupère le token dans le header de la requête
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Accès refusé, token manquant' });
  }

  try {
    // Vérifie que le token est valide
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Ajoute les infos de l'utilisateur à la requête
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};
