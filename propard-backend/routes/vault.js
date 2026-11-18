const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authMiddleware);

const vaultLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => 'e2ee-vault:' + req.user.id,
  message: 'Trop de modifications du coffre-fort. Réessaie plus tard.'
});

const isBase64 = value => typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value);

router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+e2eeVault');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ vault: user.e2eeVault || null });
  } catch (error) {
    console.error('Vault read failed:', error);
    res.status(500).json({ error: 'Impossible de charger le coffre-fort.' });
  }
});

router.put('/', vaultLimiter, async (req, res) => {
  try {
    const { version, salt, iv, ciphertext } = req.body || {};
    if (
      version !== 1 ||
      !isBase64(salt) ||
      Buffer.from(salt, 'base64').length !== 16 ||
      !isBase64(iv) ||
      Buffer.from(iv, 'base64').length !== 12 ||
      !isBase64(ciphertext) ||
      Buffer.from(ciphertext, 'base64').length < 17 ||
      Buffer.byteLength(ciphertext, 'utf8') > 1200000
    ) {
      return res.status(400).json({ error: 'Données chiffrées du coffre-fort invalides ou trop volumineuses.' });
    }
    const user = await User.findById(req.user.id).select('+e2eeVault');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    user.e2eeVault = {
      version: 1,
      salt,
      iv,
      ciphertext,
      updatedAt: new Date()
    };
    await user.save();
    res.json({ success: true, updatedAt: user.e2eeVault.updatedAt });
  } catch (error) {
    console.error('Vault save failed:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer le coffre-fort.' });
  }
});

router.delete('/', vaultLimiter, async (req, res) => {
  try {
    const result = await User.updateOne({ _id: req.user.id }, { $set: { e2eeVault: null } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Vault delete failed:', error);
    res.status(500).json({ error: 'Impossible de supprimer le coffre-fort.' });
  }
});

module.exports = router;
