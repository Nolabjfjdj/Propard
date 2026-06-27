const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

router.post('/reset-password', async (req, res) => {
  try {
    const { adminKey, username, newPassword } = req.body;

    // Vérifie la clé admin
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Username et nouveau mot de passe requis' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mot de passe minimum 6 caractères' });
    }

    const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: `Mot de passe de ${user.username} réinitialisé` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
