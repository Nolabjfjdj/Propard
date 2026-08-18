const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// ─── Vérifier que deux utilisateurs sont amis ────────────────────────────────
async function areFriends(userId, friendId) {
  const user = await User.findById(userId).select('friends');

  if (!user) return false;

  return user.friends.some(
    f => f.userId.toString() === friendId.toString()
  );
}

// ─── ROUTE : Envoyer une demande d'ami ───────────────────────────────────────
router.post('/add', async (req, res) => {
  try {
    const { ipAlias } = req.body;

    const targetUser = await User.findOne({ ipAlias });

    if (!targetUser) {
      return res.status(404).json({
        error: 'Aucun utilisateur trouvé avec cette adresse'
      });
    }

    if (
      targetUser._id.toString() ===
      req.user.id.toString()
    ) {
      return res.status(400).json({
        error: 'Impossible de s\'ajouter soi-même'
      });
    }

    const currentUser =
      await User.findById(req.user.id);

    const alreadyFriends =
      currentUser.friends.some(
        f =>
          f.userId.toString() ===
          targetUser._id.toString()
      );

    if (alreadyFriends) {
      return res.status(400).json({
        error: 'Vous êtes déjà amis'
      });
    }

    const alreadyRequested =
      targetUser.friendRequests.some(
        r =>
          r.from.toString() ===
          req.user.id.toString()
      );

    if (alreadyRequested) {
      return res.status(400).json({
        error: 'Demande déjà envoyée'
      });
    }

    targetUser.friendRequests.push({
      from: req.user.id
    });

    await targetUser.save();

    res.json({
      message: 'Demande d\'ami envoyée'
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ─── ROUTE : Accepter une demande d'ami ──────────────────────────────────────
router.post('/accept', async (req, res) => {
  try {
    const { fromUserId } = req.body;

    const currentUser =
      await User.findById(req.user.id);

    const fromUser =
      await User.findById(fromUserId);

    if (!fromUser) {
      currentUser.friendRequests =
        currentUser.friendRequests.filter(
          r =>
            r.from.toString() !==
            fromUserId.toString()
        );

      await currentUser.save();

      return res.status(404).json({
        error: 'Cet utilisateur n\'existe plus'
      });
    }

    const requestIndex =
      currentUser.friendRequests.findIndex(
        r =>
          r.from.toString() ===
          fromUserId.toString()
      );

    if (requestIndex === -1) {
      return res.status(400).json({
        error: 'Demande introuvable'
      });
    }

    currentUser.friendRequests.splice(
      requestIndex,
      1
    );

    currentUser.friends.push({
      userId: fromUserId,
      nickname: null
    });

    fromUser.friends.push({
      userId: req.user.id,
      nickname: null
    });

    await currentUser.save();
    await fromUser.save();

    res.json({
      message: 'Ami ajouté avec succès'
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ─── ROUTE : Refuser une demande d'ami ───────────────────────────────────────
router.post('/decline', async (req, res) => {
  try {
    const { fromUserId } = req.body;

    const currentUser =
      await User.findById(req.user.id);

    const requestIndex =
      currentUser.friendRequests.findIndex(
        r =>
          r.from.toString() ===
          fromUserId.toString()
      );

    if (requestIndex === -1) {
      return res.status(400).json({
        error: 'Demande introuvable'
      });
    }

    currentUser.friendRequests.splice(
      requestIndex,
      1
    );

    await currentUser.save();

    res.json({
      message: 'Demande refusée'
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ─── ROUTE : Donner un surnom à un ami ───────────────────────────────────────
router.patch('/nickname', async (req, res) => {
  try {
    const {
      friendId,
      nickname
    } = req.body;

    const currentUser =
      await User.findById(req.user.id);

    const friend =
      currentUser.friends.find(
        f =>
          f.userId.toString() ===
          friendId.toString()
      );

    if (!friend) {
      return res.status(404).json({
        error: 'Ami introuvable'
      });
    }

    friend.nickname =
      nickname || null;

    await currentUser.save();

    res.json({
      message: 'Surnom mis à jour'
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ─── ROUTE : Messages non lus par ami ───────────────────────────────────────
router.get('/unread', async (req, res) => {
  try {
    const myId = req.user.id;

    const user =
      await User.findById(myId);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const friendIds =
      user.friends.map(
        f => f.userId
      );

    const unreadCounts = {};

    for (const friendId of friendIds) {
      const count =
        await Message.countDocuments({
          sender: friendId,
          receiver: myId,
          read: false,
          deleted: {
            $ne: true
          }
        });

      if (count > 0) {
        unreadCounts[
          friendId.toString()
        ] = count;
      }
    }

    res.json(unreadCounts);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// ─── ROUTE : Marquer messages comme lus ──────────────────────────────────────
router.patch(
  '/messages/read/:friendId',
  async (req, res) => {
    try {
      const friendId =
        req.params.friendId;

      const friends =
        await areFriends(
          req.user.id,
          friendId
        );

      if (!friends) {
        return res.status(403).json({
          error: 'Vous n\'êtes pas amis avec cet utilisateur'
        });
      }

      await Message.updateMany(
        {
          sender: friendId,
          receiver: req.user.id,
          read: false
        },
        {
          read: true
        }
      );

      res.json({
        success: true
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

// ─── ROUTE : Récupérer l'historique des messages ─────────────────────────────
router.get(
  '/messages/:friendId',
  async (req, res) => {
    try {
      const {
        friendId
      } = req.params;

      const myId =
        req.user.id;

      const friends =
        await areFriends(
          myId,
          friendId
        );

      if (!friends) {
        return res.status(403).json({
          error: 'Vous n\'êtes pas amis avec cet utilisateur'
        });
      }

      /*
       * IMPORTANT E2EE :
       *
       * Le serveur retourne "content" tel quel.
       *
       * "content" contient maintenant :
       * {
       *   v: 1,
       *   iv: "...",
       *   ct: "..."
       * }
       *
       * Le backend NE DÉCHIFFRE JAMAIS ce contenu.
       */

      const messages =
        await Message.find({
          $or: [
            {
              sender: myId,
              receiver: friendId
            },
            {
              sender: friendId,
              receiver: myId
            }
          ],
          deleted: {
            $ne: true
          }
        })
          .sort({
            createdAt: 1
          })
          .limit(50)
          .populate(
            'sender',
            'username ipAlias'
          );

      res.json(messages);

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

// ─── ROUTE : Supprimer un message ────────────────────────────────────────────
router.delete(
  '/messages/:messageId',
  async (req, res) => {
    try {
      const message =
        await Message.findById(
          req.params.messageId
        );

      if (!message) {
        return res.status(404).json({
          error: 'Message introuvable'
        });
      }

      if (
        message.sender.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error: 'Non autorisé'
        });
      }

      const receiverId =
        message.receiver.toString();

      const messageId =
        message._id.toString();

      await Message.deleteOne({
        _id: message._id
      });

      const io =
        req.app.get('io');

      const connectedUsers =
        req.app.get(
          'connectedUsers'
        );

      const receiverSocket =
        connectedUsers.get(
          receiverId
        );

      if (receiverSocket) {
        io.to(receiverSocket).emit(
          'messageDeleted',
          {
            messageId
          }
        );
      }

      res.json({
        success: true,
        messageId
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

// ─── ROUTE : Modifier un message ─────────────────────────────────────────────
router.patch(
  '/messages/:messageId',
  async (req, res) => {
    try {
      const {
        content
      } = req.body;

      /*
       * Le backend reçoit ici un CIPHERTEXT.
       *
       * Il ne doit surtout PAS faire :
       * decrypt(content)
       *
       * Il stocke directement le ciphertext.
       */

      if (
        !content ||
        typeof content !== 'string' ||
        !content.trim()
      ) {
        return res.status(400).json({
          error: 'Contenu requis'
        });
      }

      const message =
        await Message.findById(
          req.params.messageId
        );

      if (!message) {
        return res.status(404).json({
          error: 'Message introuvable'
        });
      }

      if (
        message.sender.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error: 'Non autorisé'
        });
      }

      /*
       * IMPORTANT :
       *
       * On ne sauvegarde plus l'ancien
       * texte en clair dans originalContent.
       *
       * Sinon l'E2EE serait cassé.
       */

      message.content =
        content.trim();

      message.originalContent =
        null;

      message.edited = true;

      await message.save();

      /*
       * On ne renvoie pas de plaintext.
       */

      res.json({
        success: true,
        message: {
          _id: message._id,
          sender: message.sender,
          receiver: message.receiver,
          content: message.content,
          encrypted: true,
          edited: message.edited,
          createdAt: message.createdAt
        }
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

module.exports = router;