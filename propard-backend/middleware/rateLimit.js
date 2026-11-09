// Rate limiting générique en mémoire pour un processus Node.
// Les compteurs ne sont pas partagés entre plusieurs instances du serveur.
const buckets = new Map();
const MAX_BUCKETS = 50000;
let nextLimiterId = 0;

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
  const limiterId = nextLimiterId++;

  return async (req, res, next) => {
    const rawKey = keyFn ? keyFn(req) : req.ip;
    const key = `${limiterId}:${String(rawKey ?? 'unknown')}`;
    const now = Date.now();

    let bucket = buckets.get(key);

    if (!bucket) {
      if (buckets.size >= MAX_BUCKETS) {
        return res.status(429).json({
          error: 'Limite temporaire de capacité du service atteinte. Réessaie plus tard.'
        });
      }

      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    } else if (now - bucket.start > windowMs) {
      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      if (captcha) {
        const captchaToken = req.body?.captchaToken || req.get('x-captcha-token');
        if (await verifyTurnstile(captchaToken, req.ip)) {
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

// Nettoyage des compteurs après expiration de leur fenêtre réelle.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > bucket.windowMs) buckets.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { createRateLimiter, verifyTurnstile };
