const express = require('express');
const router = express.Router();

router.get('/turn-credentials', async (req, res) => {
  try {
    const response = await fetch(
      `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_SECRET_KEY}`
    );
    if (!response.ok) throw new Error('Metered API error');
    const iceServers = await response.json();
    res.json(iceServers);
  } catch (err) {
    console.error('Erreur récupération identifiants TURN:', err);
    res.status(500).json({ error: 'turn_credentials_unavailable' });
  }
});

module.exports = router;
