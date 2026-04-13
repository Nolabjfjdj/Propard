const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// ─── Pseudos interdits ───────────────────────────────────────────────────────
const PSEUDOS_INTERDITS = [
  'owner', 'admin', 'administrator', 'moderator', 'mod',
  'staff', 'support', 'propard', 'system', 'bot', 'official',
  'root', 'superuser', 'null', 'undefined', 'banned', 'deleted',
  'anonymous', 'anon', 'guest', 'server', 'service', 'help'
];

// ─── Génération IP alias ─────────────────────────────────────────────────────
function generateIpAlias() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `${part()}.${part()}.${part()}.${part()}`;
}

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
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username et mot de passe requis' });
    }
    if (username.length < 3 || username.length > 16) {
      return res.status(400).json({ error: 'Username entre 3 et 16 caractères' });
    }
    if (PSEUDOS_INTERDITS.includes(username.toLowerCase())) {
      return res.status(400).json({ error: 'Ce username n\'est pas autorisé' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mot de passe minimum 6 caractères' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Ce username est déjà pris' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const ipAlias = await generateUniqueIpAlias();

    const user = new User({ username, password: hashedPassword, ipAlias });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      user: { id: user._id, username: user.username, ipAlias: user.ipAlias }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Connexion ───────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Username ou mot de passe incorrect' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Username ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: { id: user._id, username: user.username, ipAlias: user.ipAlias }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Profil ──────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('friends.userId', 'username ipAlias isOnline');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
