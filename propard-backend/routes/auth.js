const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

const PSEUDOS_INTERDITS = ['owner','admin','administrator','superadmin','sysadmin','moderator','mod','comod','staff','team','crew','support','helpdesk','official','propard','propardbot','propardteam','propardstaff','propardadmin','propardsupport','propardofficial','everyone','nigger','nigga','faggot','retard','whore','bitch','salope','pute','connard','connasse','batard','batarde','enculé','encule','fdp','ntm','tg','pd','discord','telegram','whatsapp','snapchat','instagram','facebook','twitter','tiktok','youtube','google','microsoft','apple','amazon','netflix','spotify','twitch','reddit','github','anthropic','openai','chatgpt','claude','malware','virus','phishing','scam','billing','privacy','terms','rules','guidelines','policy'];

function generateIpAlias() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `${part()}.${part()}.${part()}.${part()}`;
}

async function generateUniqueIpAlias() {
  let ip, exists = true;
  while (exists) {
    ip = generateIpAlias();
    exists = !!await User.findOne({ ipAlias: ip });
  }
  return ip;
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username et mot de passe requis' });
    if (username.length < 3 || username.length > 16) return res.status(400).json({ error: 'Username entre 3 et 16 caractères' });
    const lower = username.toLowerCase();
    if (PSEUDOS_INTERDITS.includes(lower) || PSEUDOS_INTERDITS.some(w => lower.includes(w))) return res.status(400).json({ error: 'Ce username n\'est pas autorisé' });
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Username : lettres, chiffres, _ et - uniquement' });
    if (!/[a-zA-Z]/.test(username)) return res.status(400).json({ error: 'Username doit contenir au moins une lettre' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe minimum 6 caractères' });
    const existing = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existing) return res.status(400).json({ error: 'Ce username est déjà pris' });
    const user = new User({ username, password: await bcrypt.hash(password, 10), ipAlias: await generateUniqueIpAlias() });
    await user.save();
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ message: 'Compte créé avec succès', token, user: { id: user._id, username: user.username, ipAlias: user.ipAlias, publicKey: user.publicKey } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Username ou mot de passe incorrect' });
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Connexion réussie', token, user: { id: user._id, username: user.username, ipAlias: user.ipAlias, publicKey: user.publicKey } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').populate('friends.userId', 'username ipAlias isOnline publicKey');
    res.json(user);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/user/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('username ipAlias publicKey');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.patch('/publickey', authMiddleware, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== 'string') return res.status(400).json({ error: 'Clé publique requise' });
    if (publicKey.length > 2000) return res.status(400).json({ error: 'Clé publique invalide' });
    let parsed;
    try { parsed = JSON.parse(publicKey); } catch { return res.status(400).json({ error: 'Clé publique mal formée' }); }
    if (!parsed || parsed.kty !== 'EC' || parsed.crv !== 'P-256' || typeof parsed.x !== 'string' || typeof parsed.y !== 'string') return res.status(400).json({ error: 'Clé publique invalide' });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── ROUTE : Anonymisation du compte (Option A) ───────────────────────────────
// Supprime les données identifiantes (pseudo, mot de passe, IP alias) mais
// garde les messages ET les amitiés intactes, sous le pseudo
// "supprimé_xxxxxx". Important : on conserve `publicKey` et on ne touche
// PAS au tableau `friends` (ni au sien, ni à celui des autres) — sinon le
// secret de chiffrement partagé (ECDH) ne peut plus jamais être recalculé
// et tous les anciens messages échangés avec ce compte deviennent
// définitivement illisibles pour l'ami restant.
router.delete('/anonymize', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      username: `supprimé_${userId.toString().slice(-6)}`,
      password: await bcrypt.hash(Math.random().toString(36), 10),
      ipAlias: await generateUniqueIpAlias(),
      isOnline: false
      // publicKey, friends, friendRequests volontairement inchangés
    });

    // On retire seulement les demandes d'ami EN ATTENTE envoyées par ce
    // compte (propre à faire, sans conséquence sur le chiffrement). Les
    // amitiés déjà établies, elles, restent intactes des deux côtés.
    await User.updateMany(
      { 'friendRequests.from': userId },
      { $pull: { friendRequests: { from: userId } } }
    );

    res.json({ success: true, message: 'Compte anonymisé' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Suppression totale du compte (Option B) ─────────────────────────
// Supprime tout : compte, amis, messages. Ici c'est voulu : plus personne
// ne doit pouvoir relire ces messages, donc on les efface plutôt que de
// les laisser orphelins et indéchiffrables.
router.delete('/delete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Supprime tous les messages envoyés ou reçus
    await Message.deleteMany({
      $or: [{ sender: userId }, { receiver: userId }]
    });

    // Retire des listes d'amis et demandes de tout le monde
    await User.updateMany(
      { 'friends.userId': userId },
      { $pull: { friends: { userId } } }
    );
    await User.updateMany(
      { 'friendRequests.from': userId },
      { $pull: { friendRequests: { from: userId } } }
    );

    // Supprime le compte
    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Compte et données supprimés définitivement' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
