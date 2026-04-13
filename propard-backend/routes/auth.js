const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ─── Fonction pour générer une IP alias aléatoire ───────────────────────────
// Génère une IP du style "192.84.231.107"
function generateIpAlias() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `${part()}.${part()}.${part()}.${part()}`;
}

// S'assure que l'IP générée n'existe pas déjà en base
async function generateUniqueIpAlias() {
  let ip;
  let exists = true;

  while (exists) {
    ip = generateIpAlias();
    const user = await User.findOne({ ipAlias: ip });
    exists = !!user;
  }

  return ip;
}

// ─── ROUTE : Inscription ─────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Vérifications basiques
    if (!username || !password) {
      return res.status(400).json({ error: 'Username et mot de passe requis' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username entre 3 et 20 caractères' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe minimum 6 caractères' });
    }

    // Vérifie si le username est déjà pris
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Ce username est déjà pris' });
    }

    // Chiffre le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Génère une IP alias unique
    const ipAlias = await generateUniqueIpAlias();

    // Crée l'utilisateur
    const user = new User({
      username,
      password: hashedPassword,
      ipAlias
    });

    await user.save();

    // Crée le token JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      user: {
        id: user._id,
        username: user.username,
        ipAlias: user.ipAlias
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Connexion ───────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Cherche l'utilisateur
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Username ou mot de passe incorrect' });
    }

    // Vérifie le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Username ou mot de passe incorrect' });
    }

    // Crée le token JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        username: user.username,
        ipAlias: user.ipAlias
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Récupérer son profil ────────────────────────────────────────────
// GET /api/auth/me  (route protégée)
const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password') // N'envoie pas le mot de passe
      .populate('friends.userId', 'username ipAlias isOnline');

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;