// Rate limiting générique en mémoire (Map). Suffisant pour un seul
// processus Node (cas actuel sur Render) — voir les limites de cette
// approche expliquées à l'utilisateur : pas de partage d'état entre
// plusieurs instances si le projet scale horizontalement un jour.
const buckets = new Map();

async function verifyTurnstile(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== 'string' || !token.trim()) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set('remoteip', remoteip);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

function createRateLimiter({ windowMs, max, keyFn, message, captcha = false, resetOnCaptcha = false }) {
  return async (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      if (captcha) {
        const captchaToken = req.body?.captchaToken || req.get('x-captcha-token');
        if (await verifyTurnstile(captchaToken, req.ip)) {
          // Le CAPTCHA autorise cette tentative, mais conserve le compteur au seuil :
          // les prochaines tentatives devront aussi être vérifiées si elles dépassent la limite.
          if (resetOnCaptcha) {
            bucket.start = now;
            bucket.count = 0;
          } else {
            bucket.count = max;
          }
          return next();
        }
        return res.status(429).json({
          error: 'Vérification anti-bot requise.',
          captchaRequired: true
        });
      }
      return res.status(429).json({
        error: message || 'Trop de requêtes, merci de patienter avant de réessayer.'
      });
    }

    next();
  };
}

// Nettoyage des compteurs uniquement après l'expiration de leur fenêtre réelle.
// Ne pas utiliser une durée fixe : certaines limites durent 15 ou 60 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > bucket.windowMs) buckets.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { createRateLimiter };
