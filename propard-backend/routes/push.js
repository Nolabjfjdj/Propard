const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { getPublicKey } = require('../services/push');

router.get('/public-key', (req, res) => {
  const publicKey = getPublicKey();

  if (!publicKey) {
    return res.status(503).json({
      error: 'Les notifications Push ne sont pas configurées.'
    });
  }

  res.json({ publicKey });
});

router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const subscription = req.body?.subscription;

    if (
      !subscription ||
      typeof subscription.endpoint !== 'string' ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== 'string' ||
      typeof subscription.keys.auth !== 'string'
    ) {
      return res.status(400).json({
        error: 'Abonnement Push invalide.'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable.'
      });
    }

    user.pushSubscriptions = (user.pushSubscriptions || []).filter(
      item => item.endpoint !== subscription.endpoint
    );

    user.pushSubscriptions.push({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });

    // Évite qu'un compte accumule indéfiniment des appareils abandonnés.
    if (user.pushSubscriptions.length > 20) {
      user.pushSubscriptions = user.pushSubscriptions.slice(-20);
    }

    await user.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({
      error: 'Impossible d’enregistrer les notifications.'
    });
  }
});

router.delete('/subscribe', authMiddleware, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;

    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({
        error: 'Endpoint Push invalide.'
      });
    }

    await User.updateOne(
      { _id: req.user.id },
      {
        $pull: {
          pushSubscriptions: { endpoint }
        }
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({
      error: 'Impossible de désactiver les notifications.'
    });
  }
});

module.exports = router;
