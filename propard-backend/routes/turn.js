const express = require('express');
const router = express.Router();

router.get('/turn-credentials', async (req, res) => {
  try {
    const url = `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_SECRET_KEY}`;
    console.log('Fetching TURN credentials from:', url);
    
    const response = await fetch(url);
    const text = await response.text();
    console.log('Metered response status:', response.status);
    console.log('Metered response body:', text);
    
    if (!response.ok) throw new Error(`Metered API error: ${response.status} - ${text}`);
    
    const iceServers = JSON.parse(text);
    res.json(iceServers);
  } catch (err) {
    console.error('Erreur récupération identifiants TURN:', err.message);
    res.status(500).json({ error: 'turn_credentials_unavailable', details: err.message });
  }
});

module.exports = router;
