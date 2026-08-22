const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

const PSEUDOS_INTERDITS = ['owner','admin','administrator','superadmin','sysadmin','moderator','mod','comod','staff','team','crew','support','helpdesk','official','propard','propardbot','propardteam','propardstaff','propardadmin','propardsupport','propardofficial','everyone','nigger','nigga','faggot','retard','whore','bitch','salope','pute','connard','connasse','batard','batarde','enculé','encule','fdp','ntm','tg','pd','discord','telegram','whatsapp','snapchat','instagram','facebook','twitter','tiktok','youtube','google','microsoft','apple','amazon','netflix','spotify','twitch','reddit','github','anthropic','openai','chatgpt','claude','malware','virus','phishing','scam','billing','privacy','terms','rules','guidelines','policy'];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

    // Vérifie aussi contre les pseudos "réels" de comptes en anonymisation
    // en cours, pour éviter tout conflit pendant leur fenêtre de 30 jours.
    const existing = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${username}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${username}$`, 'i') } }
      ]
    });
    if (existing) return res.status(400).json({ error: 'Ce username est déjà pris' });

    const user = new User({ username, password: await bcrypt.hash(password, 10), ipAlias: await generateUniqueIpAlias() });
    await user.save();
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      user: { id: user._id, username: user.username, ipAlias: user.ipAlias, publicKey: user.publicKey, pendingDeletion: false, deletionExpiresAt: null }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Un compte anonymisé garde son vrai pseudo dans `realUsername` — on
    // permet donc de se reconnecter avec l'un OU l'autre.
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${username}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${username}$`, 'i') } }
      ]
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Pseudo ou mot de passe incorrect' });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const deletionExpiresAt = user.pendingDeletionAt
      ? new Date(user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS)
      : null;

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        username: user.username,
        ipAlias: user.ipAlias,
        publicKey: user.publicKey,
        pendingDeletion: !!user.pendingDeletionAt,
        deletionExpiresAt
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -realUsername')
      .populate('friends.userId', 'username ipAlias isOnline publicKey');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const userObj = user.toObject();
    userObj.pendingDeletion = !!user.pendingDeletionAt;
    userObj.deletionExpiresAt = user.pendingDeletionAt
      ? new Date(user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS)
      : null;

    res.json(userObj);
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

// ─── ROUTE : Anonymisation du compte (Option A, réversible 30 jours) ─────────
// Masque immédiatement le pseudo (affiché "supprimé_xxxxxx" partout) mais
// garde le pseudo réel + mot de passe intacts pendant 30 jours, pour
// permettre à l'utilisateur de se reconnecter et annuler en cas d'erreur.
// publicKey et friends restent inchangés dans tous les cas : les messages
// échangés doivent rester déchiffrables par l'ami, que la suppression soit
// annulée ou finalisée plus tard.
router.delete('/anonymize', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });

    if (!user.pendingDeletionAt) {
      user.realUsername = user.username;
      user.username = `supprimé_${userId.toString().slice(-6)}`;
      user.pendingDeletionAt = new Date();
      user.isOnline = false;
      await user.save();
    }

    // Retire seulement les demandes d'ami EN ATTENTE envoyées par ce
    // compte. Les amitiés déjà établies restent intactes des deux côtés.
    await User.updateMany(
      { 'friendRequests.from': userId },
      { $pull: { friendRequests: { from: userId } } }
    );

    res.json({
      success: true,
      message: 'Compte anonymisé. Reconnecte-toi avec ton pseudo et mot de passe habituels dans les 30 jours pour annuler.'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Annuler une anonymisation en cours ──────────────────────────────
router.post('/cancel-deletion', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    if (!user.pendingDeletionAt) {
      return res.status(400).json({ error: 'Aucune suppression en cours pour ce compte' });
    }

    const expiresAt = new Date(user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS);
    if (Date.now() > expiresAt.getTime()) {
      return res.status(400).json({ error: 'Le délai de 30 jours est dépassé, restauration impossible' });
    }

    user.username = user.realUsername;
    user.realUsername = null;
    user.pendingDeletionAt = null;
    await user.save();

    res.json({ success: true, message: 'Compte restauré avec succès', username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Suppression totale du compte (Option B, immédiate et irréversible) ──
router.delete('/delete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await Message.deleteMany({
      $or: [{ sender: userId }, { receiver: userId }]
    });

    await User.updateMany(
      { 'friends.userId': userId },
      { $pull: { friends: { userId } } }
    );
    await User.updateMany(
      { 'friendRequests.from': userId },
      { $pull: { friendRequests: { from: userId } } }
    );

    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Compte et données supprimés définitivement' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Finalisation automatique après 30 jours ──────────────────────────────────
// Passé le délai, l'anonymisation devient irréversible : mot de passe et
// IP alias sont écrasés définitivement (login impossible même avec le vrai
// pseudo). publicKey et friends restent intacts pour ne jamais casser le
// déchiffrement des messages côté amis.
async function finalizeExpiredDeletions() {
  try {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const expired = await User.find({ pendingDeletionAt: { $ne: null, $lte: cutoff } });

    for (const user of expired) {
      user.password = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
      user.ipAlias = await generateUniqueIpAlias();
      user.realUsername = null;
      user.pendingDeletionAt = null;
      await user.save();
    }

    if (expired.length) {
      console.log(`🧹 ${expired.length} compte(s) définitivement anonymisé(s) après 30 jours`);
    }
  } catch (err) {
    console.error('Erreur finalizeExpiredDeletions:', err);
  }
}

setInterval(finalizeExpiredDeletions, 6 * 60 * 60 * 1000);
finalizeExpiredDeletions();

module.exports = router;
