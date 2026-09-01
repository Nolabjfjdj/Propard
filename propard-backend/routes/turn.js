const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// 10 récupérations de credentials TURN par minute et par utilisateur —
// largement suffisant pour un usage normal (un appel en déclenche une
// seule), tout en empêchant de spammer l'API du fournisseur.
const turnRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyFn: (req) => req.user.id,
  message: 'Trop de demandes de connexion, merci de patienter.'
});

router.get('/turn-credentials', authMiddleware, turnRateLimiter, async (req, res) => {
  try {
    const url = `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_SECRET_KEY}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Metered API error: ${response.status}`);
    }

    const iceServers = JSON.parse(text);
    res.json(iceServers);
  } catch (err) {
    // IMPORTANT : ne jamais logger `url` (contient METERED_SECRET_KEY),
    // ni `text`/le body de la réponse (contient les credentials TURN),
    // ni renvoyer err.message au client (pourrait exposer des détails
    // internes). Un log générique suffit pour le débogage.
    console.error(`Erreur récupération identifiants TURN (utilisateur ${req.user.id})`);
    res.status(502).json({ error: 'turn_credentials_unavailable' });
  }
});

module.exports = router;
