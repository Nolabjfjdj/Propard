const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { isEncryptedMessagePayload } = require('../utils/inputValidation');
const { parseMessagePagination } = require('../utils/messagePagination');
const { createRateLimiter } = require('../middleware/rateLimit');

router.use(authMiddleware);

async function areFriends(userId, friendId) {
  const user = await User.findById(userId).select('friends');

  return !!user && user.friends.some(
    f => f.userId.toString() === friendId.toString()
  );
}

router.post('/add', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: req => `friend-add:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de demandes d’ami. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { ipAlias, userId } = req.body;

    let targetUser = null;

    if (userId !== undefined && userId !== null && userId !== '') {
      if (typeof userId !== 'string' || !mongoose.isValidObjectId(userId)) {
        return res.status(400).json({
          error: 'ID invalide'
        });
      }

      targetUser = await User.findById(userId);
    } else if (ipAlias !== undefined && ipAlias !== null && ipAlias !== '') {
      if (
        typeof ipAlias !== 'string' ||
        ipAlias.length > 23 ||
        !/^\d{1,5}(?:\.\d{1,5}){3}$/.test(ipAlias)
      ) {
        return res.status(400).json({
          error: 'Alias IP invalide'
        });
      }

      targetUser = await User.findOne({ ipAlias });
    } else {
      return res.status(400).json({
        error: 'ipAlias ou userId requis'
      });
    }

    if (!targetUser) {
      return res.status(404).json({
        error: 'Aucun utilisateur trouvé'
      });
    }

    if (
      targetUser._id.toString() ===
      req.user.id.toString()
    ) {
      return res.status(400).json({
        error: "Impossible de s'ajouter soi-même"
      });
    }

    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const targetBlockedMe = (
      targetUser.blockedUsers || []
    ).some(
      id => id.toString() === req.user.id.toString()
    );

    const iBlockedTarget = (
      currentUser.blockedUsers || []
    ).some(
      id => id.toString() === targetUser._id.toString()
    );

    if (targetBlockedMe || iBlockedTarget) {
      return res.status(400).json({
        error: "Impossible d'envoyer une demande à cet utilisateur"
      });
    }

    if (
      currentUser.friends.some(
        f => f.userId.toString() === targetUser._id.toString()
      )
    ) {
      return res.status(400).json({
        error: 'Vous êtes déjà amis'
      });
    }

    if (
      targetUser.friendRequests.some(
        r => r.from.toString() === req.user.id.toString()
      )
    ) {
      return res.status(400).json({
        error: 'Demande déjà envoyée'
      });
    }

    targetUser.friendRequests.push({
      from: req.user.id
    });

    await targetUser.save();

    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');
    const { sendPushNotification } = require('../services/push');

    if (io && emitToUser) {
      emitToUser(
        io,
        targetUser._id.toString(),
        'friendRequestReceived',
        {
          fromUserId: req.user.id.toString()
        }
      );
    }

    void sendPushNotification(targetUser._id.toString(), {
      title: 'Nouvelle demande d’ami',
      body: `${currentUser.displayName || currentUser.username} t’a envoyé une demande d’ami`,
      url: '/',
      tag: `friend-request-${req.user.id.toString()}`,
      data: {
        type: 'friend-request',
        fromUserId: req.user.id.toString()
      }
    });

    res.json({
      message: "Demande d'ami envoyée"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.post('/accept', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyFn: req => `friend-accept:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de demandes traitées. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { fromUserId } = req.body;

    if (typeof fromUserId !== 'string' || !mongoose.isValidObjectId(fromUserId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const currentUser = await User.findById(req.user.id);
    const fromUser = await User.findById(fromUserId);

    if (!currentUser || !fromUser) {
      return res.status(404).json({
        error: "Cet utilisateur n'existe plus"
      });
    }

    const blocked =
      (currentUser.blockedUsers || []).some(
        id => id.toString() === fromUserId.toString()
      ) ||
      (fromUser.blockedUsers || []).some(
        id => id.toString() === req.user.id.toString()
      );

    if (blocked) {
      currentUser.friendRequests =
        currentUser.friendRequests.filter(
          r => r.from.toString() !== fromUserId.toString()
        );

      await currentUser.save();

      return res.status(400).json({
        error: "Impossible d'accepter cette demande"
      });
    }

    const i = currentUser.friendRequests.findIndex(
      r => r.from.toString() === fromUserId.toString()
    );

    if (i === -1) {
      return res.status(400).json({
        error: 'Demande introuvable'
      });
    }

    currentUser.friendRequests.splice(i, 1);

    if (
      !currentUser.friends.some(
        f => f.userId.toString() === fromUserId.toString()
      )
    ) {
      currentUser.friends.push({
        userId: fromUserId,
        nickname: null
      });
    }

    if (
      !fromUser.friends.some(
        f => f.userId.toString() === req.user.id.toString()
      )
    ) {
      fromUser.friends.push({
        userId: req.user.id,
        nickname: null
      });
    }

    await currentUser.save();
    await fromUser.save();

    res.json({
      message: 'Ami ajouté avec succès'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.post('/decline', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyFn: req => `friend-decline:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de demandes traitées. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { fromUserId } = req.body;

    if (!mongoose.isValidObjectId(fromUserId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const i = user.friendRequests.findIndex(
      r => r.from.toString() === fromUserId.toString()
    );

    if (i === -1) {
      return res.status(400).json({
        error: 'Demande introuvable'
      });
    }

    user.friendRequests.splice(i, 1);

    await user.save();

    res.json({
      message: 'Demande refusée'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.patch('/nickname', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyFn: req => `friend-nickname:${req.user.id}`,
  message: 'Trop de changements de surnom. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { friendId, nickname } = req.body;

    if (typeof friendId !== 'string' || !mongoose.isValidObjectId(friendId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const friend = user.friends.find(
      f => f.userId.toString() === friendId.toString()
    );

    if (!friend) {
      return res.status(404).json({
        error: 'Ami introuvable'
      });
    }

    if (
      nickname !== null &&
      nickname !== undefined &&
      typeof nickname !== 'string'
    ) {
      return res.status(400).json({
        error: 'Surnom invalide'
      });
    }

    const cleanNickname =
      typeof nickname === 'string'
        ? nickname.trim()
        : '';

    if (cleanNickname.length > 32) {
      return res.status(400).json({
        error: 'Surnom trop long'
      });
    }

    friend.nickname = cleanNickname || null;

    await user.save();

    res.json({
      success: true,
      nickname: friend.nickname
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.get('/unread', createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyFn: req => `message-unread:${req.user.id}`,
  message: 'Trop de vérifications de messages. Réessaie dans un instant.'
}), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const out = {};

    for (const friendId of user.friends.map(f => f.userId)) {
      const count = await Message.countDocuments({
        sender: friendId,
        receiver: req.user.id,
        read: false,
        deleted: { $ne: true }
      });

      if (count > 0) {
        out[friendId.toString()] = count;
      }
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.patch('/messages/read/:friendId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.friendId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    if (!await areFriends(req.user.id, req.params.friendId)) {
      return res.status(403).json({
        error: "Vous n'êtes pas amis avec cet utilisateur"
      });
    }

    await Message.updateMany(
      {
        sender: req.params.friendId,
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
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.get('/messages/:friendId', createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyFn: req => `message-history:${req.user.id}`,
  message: 'Trop de chargements de messages. Réessaie dans un instant.'
}), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.friendId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    const { friendId } = req.params;

    if (!await areFriends(req.user.id, friendId)) {
      return res.status(403).json({
        error: "Vous n'êtes pas amis avec cet utilisateur"
      });
    }

    const pagination = parseMessagePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        error: 'Paramètres de pagination invalides'
      });
    }

    const filter = {
      $or: [
        {
          sender: req.user.id,
          receiver: friendId
        },
        {
          sender: friendId,
          receiver: req.user.id
        }
      ],
      deleted: { $ne: true }
    };

    if (pagination.before) {
      filter.createdAt = { $lt: pagination.before };
    }

    let query = Message.find(filter)
      .populate(
        'sender',
        'username displayName avatar ipAlias'
      );

    if (pagination.enabled) {
      query = query
        .sort({ createdAt: -1, _id: -1 })
        .limit(pagination.limit + 1);
    } else {
      query = query
        .sort({ createdAt: -1, _id: -1 })
        .limit(50);
    }

    let messages = await query;

    if (!pagination.enabled) {
      messages.reverse();
    }

    if (pagination.enabled) {
      const hasMore = messages.length > pagination.limit;

      if (hasMore) {
        messages = messages.slice(0, pagination.limit);
      }

      messages.reverse();

      res.set('X-Has-More', String(hasMore));

      if (hasMore && messages.length > 0) {
        res.set(
          'X-Next-Before',
          messages[0].createdAt.toISOString()
        );
      }
    }

    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.delete('/messages/:messageId', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  keyFn: req => `message-delete:${req.user.id}`,
  message: 'Trop de suppressions de messages. Réessaie plus tard.'
}), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    const message = await Message.findById(
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

    const receiverId = message.receiver.toString();
    const messageId = message._id.toString();

    await Message.deleteOne({
      _id: message._id
    });

    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');

    if (io && emitToUser) {
      emitToUser(
        io,
        receiverId,
        'messageDeleted',
        { messageId }
      );
    }

    res.json({
      success: true,
      messageId
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.patch('/messages/:messageId', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  keyFn: req => `message-edit:${req.user.id}`,
  message: 'Trop de modifications de messages. Réessaie plus tard.'
}), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    const { content } = req.body;

    if (
      !content ||
      typeof content !== 'string' ||
      !content.trim() ||
      !isEncryptedMessagePayload(content)
    ) {
      return res.status(400).json({
        error: 'Contenu requis'
      });
    }

    const message = await Message.findById(
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

    message.content = content.trim();
    message.encrypted = true;
    message.originalContent = null;
    message.edited = true;

    await message.save();

    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');

    if (io && emitToUser) {
      emitToUser(
        io,
        message.receiver.toString(),
        'messageEdited',
        {
          messageId: message._id.toString(),
          content: message.content,
          encrypted: true,
          edited: true
        }
      );
    }

    res.json({
      success: true,
      message: {
        _id: message._id,
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        encrypted: true,
        edited: true,
        createdAt: message.createdAt
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.delete('/:friendId', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: req => `friend-remove:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de suppressions d’amis. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { friendId } = req.params;

    if (!mongoose.isValidObjectId(friendId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const currentUser = await User.findById(req.user.id);
    const friendUser = await User.findById(friendId);

    if (!currentUser || !friendUser) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const wasFriend = currentUser.friends.some(
      f => f.userId.toString() === friendId.toString()
    );

    if (!wasFriend) {
      return res.status(400).json({
        error: "Vous n'êtes pas ami avec cet utilisateur"
      });
    }

    currentUser.friends =
      currentUser.friends.filter(
        f => f.userId.toString() !== friendId.toString()
      );

    friendUser.friends =
      friendUser.friends.filter(
        f => f.userId.toString() !== req.user.id.toString()
      );

    await currentUser.save();
    await friendUser.save();

    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');

    req.app.get('callState')?.endPrivateCall(
      req.user.id,
      friendId
    );

    if (io && emitToUser) {
      emitToUser(
        io,
        friendId,
        'friendRemoved',
        {
          userId: req.user.id
        }
      );
    }

    res.json({
      success: true,
      message: 'Ami supprimé'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.post('/block/:userId', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: req => `user-block:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de changements de blocage. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    if (
      userId.toString() ===
      req.user.id.toString()
    ) {
      return res.status(400).json({
        error: 'Impossible de se bloquer soi-même'
      });
    }

    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(userId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const alreadyBlocked = (
      currentUser.blockedUsers || []
    ).some(
      id => id.toString() === userId.toString()
    );

    if (alreadyBlocked) {
      return res.status(400).json({
        error: 'Déjà bloqué'
      });
    }

    if (!currentUser.blockedUsers) {
      currentUser.blockedUsers = [];
    }

    currentUser.blockedUsers.push(userId);

    const wereFriends = currentUser.friends.some(
      f => f.userId.toString() === userId.toString()
    );

    if (wereFriends) {
      currentUser.friends =
        currentUser.friends.filter(
          f => f.userId.toString() !== userId.toString()
        );

      targetUser.friends =
        targetUser.friends.filter(
          f => f.userId.toString() !== req.user.id.toString()
        );
    }

    currentUser.friendRequests =
      currentUser.friendRequests.filter(
        r => r.from.toString() !== userId.toString()
      );

    targetUser.friendRequests =
      targetUser.friendRequests.filter(
        r => r.from.toString() !== req.user.id.toString()
      );

    await currentUser.save();
    await targetUser.save();

    req.app.get('callState')?.endPrivateCall(
      req.user.id,
      userId
    );

    if (wereFriends) {
      const io = req.app.get('io');
      const emitToUser = req.app.get('emitToUser');

      if (io && emitToUser) {
        emitToUser(
          io,
          userId,
          'friendRemoved',
          {
            userId: req.user.id
          }
        );
      }
    }

    res.json({
      success: true,
      message: 'Utilisateur bloqué'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.post('/unblock/:userId', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: req => `user-unblock:${req.user.id}`,
  captcha: true,
  resetOnCaptcha: true,
  message: 'Trop de changements de blocage. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const wasBlocked = (
      currentUser.blockedUsers || []
    ).some(
      id => id.toString() === userId.toString()
    );

    if (!wasBlocked) {
      return res.status(400).json({
        error: "Cet utilisateur n'est pas bloqué"
      });
    }

    currentUser.blockedUsers =
      currentUser.blockedUsers.filter(
        id => id.toString() !== userId.toString()
      );

    await currentUser.save();

    res.json({
      success: true,
      message: 'Utilisateur débloqué'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


router.post('/messages/:messageId/reactions', createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  keyFn: req => `message-reaction:${req.user.id}`,
  message: 'Trop de réactions. Réessaie plus tard.'
}), async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body || {};
    const isSingleEmoji = value => {
      if (typeof value !== 'string' || value.length > 32 || /[\u0000-\u001F\u007F]/.test(value)) return false;
      if (typeof Intl.Segmenter !== 'function') return false;
      const segments = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(value)];
      return segments.length === 1 && /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3)/u.test(value);
    };

    if (!mongoose.isValidObjectId(messageId) || !isSingleEmoji(emoji)) {
      return res.status(400).json({ error: 'Réaction invalide.' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.deleted) {
      return res.status(404).json({ error: 'Message introuvable.' });
    }

    const userId = req.user.id.toString();
    const senderId = message.sender.toString();
    const receiverId = message.receiver.toString();

    if (userId !== senderId && userId !== receiverId) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    const otherId = userId === senderId ? receiverId : senderId;
    if (!await areFriends(userId, otherId)) {
      return res.status(403).json({ error: 'Cette conversation n’est plus accessible.' });
    }

    const participants = await User.find({ _id: { $in: [userId, otherId] } }).select('blockedUsers');
    if (participants.some(user => (user.blockedUsers || []).some(id => id.toString() === (user._id.toString() === userId ? otherId : userId)))) {
      return res.status(403).json({ error: 'Cette interaction n’est pas autorisée.' });
    }

    const existingIndex = message.reactions.findIndex(reaction =>
      reaction.userId.toString() === userId && reaction.emoji === emoji
    );
    const isAddingReaction = existingIndex < 0;

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      if (message.reactions.length >= 500) {
        return res.status(409).json({ error: 'Trop de réactions sur ce message.' });
      }
      message.reactions.push({ userId, emoji });
    }

    await message.save();
    const reactions = message.reactions.map(reaction => ({
      userId: reaction.userId.toString(),
      emoji: reaction.emoji
    }));
    const payload = { messageId, reactions };
    if (isAddingReaction && senderId !== userId) {
      const actor = await User.findById(userId).select('displayName username');
      const actorName = actor?.displayName || actor?.username || 'Quelqu’un';
      const { sendPushNotification } = require('../services/push');
      void sendPushNotification(senderId, {
        title: 'Nouvelle réaction',
        body: `${actorName} a réagi ${emoji} à ton message`,
        url: '/',
        tag: `message-reaction-${messageId}`,
        data: { type: 'message-reaction', messageId, conversationId: otherId }
      }).catch(error => console.error('Message reaction notification error:', error));
    }
    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');

    if (io && emitToUser) {
      for (const participantId of new Set([senderId, receiverId])) {
        emitToUser(io, participantId, 'messageReactionsUpdated', payload);
      }
    }

    res.json({ success: true, reactions });
  } catch (e) {
    console.error('Message reaction error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


module.exports = router;