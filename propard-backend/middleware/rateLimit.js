// Rate limiting générique en mémoire (Map). Suffisant pour un seul
// processus Node (cas actuel sur Render) — voir les limites de cette
// approche expliquées à l'utilisateur : pas de partage d'état entre
// plusieurs instances si le projet scale horizontalement un jour.
const buckets = new Map();

function createRateLimiter({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      return res.status(429).json({
        error: message || 'Trop de requêtes, merci de patienter avant de réessayer.'
      });
    }

    next();
  };
}

// Nettoyage périodique pour éviter une fuite mémoire indéfinie : les
// entrées inactives depuis plus de 10 minutes sont oubliées.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > 10 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { createRateLimiter };
