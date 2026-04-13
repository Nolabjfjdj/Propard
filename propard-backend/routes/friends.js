const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

// Toutes ces routes nécessitent d'être connecté
router.use(authMiddleware);

// ─── ROUTE : Envoyer une demande d'ami ───────────────────────────────────────
// POST /api/friends/add
router.post('/add', async (req, res) => {
  try {
    const { ipAlias } = req.body;

    // Cherche l'utilisateur par son IP alias
    const targetUser = await User.findOne({ ipAlias });
    if (!targetUser) {
      return res.status(404).json({ error: 'Aucun utilisateur trouvé avec cette adresse' });
    }

    // On ne peut pas s'ajouter soi-même
    if (targetUser._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'Impossible de s\'ajouter soi-même' });
    }

    // Vérifie si déjà amis
    const currentUser = await User.findById(req.user.id);
    const alreadyFriends = currentUser.friends.some(
      f => f.userId.toString() === targetUser._id.toString()
    );
    if (alreadyFriends) {
      return res.status(400).json({ error: 'Vous êtes déjà amis' });
    }

    // Vérifie si demande déjà envoyée
    const alreadyRequested = targetUser.friendRequests.some(
      r => r.from.toString() === req.user.id
    );
    if (alreadyRequested) {
      return res.status(400).json({ error: 'Demande déjà envoyée' });
    }

    // Ajoute la demande d'ami
    targetUser.friendRequests.push({ from: req.user.id });
    await targetUser.save();

    res.json({ message: 'Demande d\'ami envoyée' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Accepter une demande d'ami ──────────────────────────────────────
// POST /api/friends/accept
router.post('/accept', async (req, res) => {
  try {
    const { fromUserId } = req.body;

    const currentUser = await User.findById(req.user.id);
    const fromUser = await User.findById(fromUserId);

    if (!fromUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Vérifie que la demande existe
    const requestIndex = currentUser.friendRequests.findIndex(
      r => r.from.toString() === fromUserId
    );
    if (requestIndex === -1) {
      return res.status(400).json({ error: 'Demande introuvable' });
    }

    // Supprime la demande
    currentUser.friendRequests.splice(requestIndex, 1);

    // Ajoute mutuellement en amis
    currentUser.friends.push({ userId: fromUserId, nickname: null });
    fromUser.friends.push({ userId: req.user.id, nickname: null });

    await currentUser.save();
    await fromUser.save();

    res.json({ message: 'Ami ajouté avec succès' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Donner un surnom à un ami ───────────────────────────────────────
// PATCH /api/friends/nickname
router.patch('/nickname', async (req, res) => {
  try {
    const { friendId, nickname } = req.body;

    const currentUser = await User.findById(req.user.id);

    const friend = currentUser.friends.find(
      f => f.userId.toString() === friendId
    );
    if (!friend) {
      return res.status(404).json({ error: 'Ami introuvable' });
    }

    friend.nickname = nickname || null;
    await currentUser.save();

    res.json({ message: 'Surnom mis à jour' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ROUTE : Récupérer l'historique des messages ─────────────────────────────
// GET /api/friends/messages/:friendId
router.get('/messages/:friendId', async (req, res) => {
  try {
    const { friendId } = req.params;
    const myId = req.user.id;

    // Récupère les messages entre les deux utilisateurs
    const messages = await Message.find({
      $or: [
        { sender: myId, receiver: friendId },
        { sender: friendId, receiver: myId }
      ]
    })
    .sort({ createdAt: 1 }) // Du plus ancien au plus récent
    .limit(50)
    .populate('sender', 'username ipAlias');

    res.json(messages);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;