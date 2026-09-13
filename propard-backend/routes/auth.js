const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const PSEUDOS_INTERDITS = ['owner','admin','administrator','superadmin','sysadmin','moderator','mod','comod','staff','team','crew','support','helpdesk','official','propard','propardbot','propardteam','propardstaff','propardadmin','propardsupport','propardofficial','everyone','nigger','nigga','faggot','retard','whore','bitch','salope','pute','connard','connasse','batard','batarde','enculé','encule','fdp','ntm','tg','pd','discord','telegram','whatsapp','snapchat','instagram','facebook','twitter','tiktok','youtube','google','microsoft','apple','amazon','netflix','spotify','twitch','reddit','github','anthropic','openai','chatgpt','claude','malware','virus','phishing','scam','billing','privacy','terms','rules','guidelines','policy'];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}:${(req.body?.username || '').toLowerCase()}`,
  message: 'Trop de tentatives de connexion, réessaie dans quelques minutes.'
});

const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyFn: (req) => req.ip,
  message: 'Trop de comptes créés depuis cette adresse, réessaie plus tard.'
});

function generateIpAlias() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `${part()}.${part()}.${part()}.${part()}`;
}

async function generateUniqueIpAlias() {
  let ip;
  let exists = true;

  while (exists) {
    ip = generateIpAlias();
    exists = !!await User.findOne({ ipAlias: ip });
  }

  return ip;
}

router.post('/register', registerRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username et mot de passe requis' });
    }

    if (username.length < 3 || username.length > 16) {
      return res.status(400).json({ error: 'Username entre 3 et 16 caractères' });
    }

    const lower = username.toLowerCase();

    if (
      PSEUDOS_INTERDITS.includes(lower) ||
      PSEUDOS_INTERDITS.some(w => lower.includes(w))
    ) {
      return res.status(400).json({ error: 'Ce username n\'est pas autorisé' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({
        error: 'Username : lettres, chiffres, _ et - uniquement'
      });
    }

    if (!/[a-zA-Z]/.test(username)) {
      return res.status(400).json({
        error: 'Username doit contenir au moins une lettre'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Mot de passe minimum 8 caractères'
      });
    }

    const existing = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${username}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${username}$`, 'i') } }
      ]
    });

    if (existing) {
      return res.status(400).json({
        error: 'Ce username est déjà pris'
      });
    }

    const user = new User({
      username,
      password: await bcrypt.hash(password, 10),
      ipAlias: await generateUniqueIpAlias()
    });

    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d'
      }
    );

    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        ipAlias: user.ipAlias,
        publicKey: user.publicKey,
        pendingDeletion: false,
        deletionExpiresAt: null
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${username}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${username}$`, 'i') } }
      ]
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({
        error: 'Pseudo ou mot de passe incorrect'
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d'
      }
    );

    const deletionExpiresAt = user.pendingDeletionAt
      ? new Date(user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS)
      : null;

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        ipAlias: user.ipAlias,
        publicKey: user.publicKey,
        pendingDeletion: !!user.pendingDeletionAt,
        deletionExpiresAt
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -realUsername')
      .populate(
        'friends.userId',
        'username displayName avatar ipAlias isOnline publicKey'
      );

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const userObj = user.toObject();

    userObj.pendingDeletion = !!user.pendingDeletionAt;
    userObj.deletionExpiresAt = user.pendingDeletionAt
      ? new Date(
          user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS
        )
      : null;

    res.json(userObj);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const { displayName, avatar } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    if (displayName !== undefined) {
      if (typeof displayName !== 'string') {
        return res.status(400).json({
          error: 'Nom d’affichage invalide'
        });
      }

      const trimmed = displayName.trim();

      if (trimmed.length > 32) {
        return res.status(400).json({
          error: 'Nom d’affichage trop long'
        });
      }

      user.displayName = trimmed || null;
    }

    if (avatar !== undefined) {
      if (avatar !== null && typeof avatar !== 'string') {
        return res.status(400).json({
          error: 'Avatar invalide'
        });
      }

      if (
        typeof avatar === 'string' &&
        avatar.length > 1000000
      ) {
        return res.status(400).json({
          error: 'Avatar trop volumineux'
        });
      }

      user.avatar = avatar || null;
    }

    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        ipAlias: user.ipAlias,
        publicKey: user.publicKey
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/user/:id', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID invalide'
      });
    }

    const viewerId = req.user.id.toString();
    const profileId = req.params.id.toString();

    const [viewer, profile] = await Promise.all([
      User.findById(viewerId)
        .select('friends friendRequests blockedUsers'),

      User.findById(profileId)
        .select(
          'username displayName avatar ipAlias publicKey isOnline friends friendRequests'
        )
    ]);

    if (!viewer || !profile) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const isOwnProfile = viewerId === profileId;

    const isFriend = viewer.friends.some(
      f => f.userId?.toString() === profileId
    );

    const requestReceivedByMe = viewer.friendRequests.some(
      r => r.from?.toString() === profileId
    );

    const requestSentByMe = profile.friendRequests.some(
      r => r.from?.toString() === viewerId
    );

    const isBlockedByMe = (viewer.blockedUsers || []).some(
      id => id.toString() === profileId
    );

    let friendNickname = null;

    if (isFriend) {
      const friendship = viewer.friends.find(
        f => f.userId?.toString() === profileId
      );

      friendNickname = friendship?.nickname || null;
    }

    let mutualFriends = [];

    if (!isOwnProfile && !isBlockedByMe) {
      const viewerFriendIds = new Set(
        viewer.friends
          .map(f => f.userId?.toString())
          .filter(Boolean)
      );

      const mutualIds = profile.friends
        .map(f => f.userId?.toString())
        .filter(
          id => id && viewerFriendIds.has(id)
        );

      const uniqueIds = [...new Set(mutualIds)];

      if (uniqueIds.length > 0) {
        const mutualUsers = await User.find({
          _id: {
            $in: uniqueIds
          }
        }).select('username displayName avatar');

        mutualFriends = mutualUsers.map(u => ({
          _id: u._id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar
        }));
      }
    }

    res.json({
      _id: profile._id,
      username: profile.username,
      displayName: profile.displayName,
      avatar: profile.avatar,
      ipAlias: profile.ipAlias,
      publicKey: profile.publicKey,
      isOnline: profile.isOnline,

      isOwnProfile,
      isFriend,
      friendNickname,

      requestReceivedByMe,
      requestSentByMe,

      isBlockedByMe,

      mutualFriendsCount: mutualFriends.length,
      mutualFriends
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/publickey', authMiddleware, async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({
        error: 'Clé publique requise'
      });
    }

    if (publicKey.length > 2000) {
      return res.status(400).json({
        error: 'Clé publique invalide'
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(publicKey);
    } catch {
      return res.status(400).json({
        error: 'Clé publique mal formée'
      });
    }

    if (
      !parsed ||
      parsed.kty !== 'EC' ||
      parsed.crv !== 'P-256' ||
      typeof parsed.x !== 'string' ||
      typeof parsed.y !== 'string'
    ) {
      return res.status(400).json({
        error: 'Clé publique invalide'
      });
    }

    await User.findByIdAndUpdate(
      req.user.id,
      { publicKey }
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/anonymize', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'Compte introuvable'
      });
    }

    if (!user.pendingDeletionAt) {
      user.realUsername = user.username;
      user.username = `supprimé_${userId.toString().slice(-6)}`;
      user.pendingDeletionAt = new Date();
      user.isOnline = false;
      await user.save();
    }

    await User.updateMany(
      { 'friendRequests.from': userId },
      {
        $pull: {
          friendRequests: {
            from: userId
          }
        }
      }
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

router.post('/cancel-deletion', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Compte introuvable'
      });
    }

    if (!user.pendingDeletionAt) {
      return res.status(400).json({
        error: 'Aucune suppression en cours pour ce compte'
      });
    }

    const expiresAt = new Date(
      user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS
    );

    if (Date.now() > expiresAt.getTime()) {
      return res.status(400).json({
        error: 'Le délai de 30 jours est dépassé, restauration impossible'
      });
    }

    user.username = user.realUsername;
    user.realUsername = null;
    user.pendingDeletionAt = null;

    await user.save();

    res.json({
      success: true,
      message: 'Compte restauré avec succès',
      username: user.username
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/delete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await Message.deleteMany({
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    });

    await GroupMessage.deleteMany({
      sender: userId
    });

    const ownedGroups =
      await Group.find({
        owner: userId
      }).select('_id');

    const ownedGroupIds =
      ownedGroups.map(group => group._id);

    if (ownedGroupIds.length > 0) {
      await GroupMessage.deleteMany({
        group: {
          $in: ownedGroupIds
        }
      });

      await Group.deleteMany({
        _id: {
          $in: ownedGroupIds
        }
      });
    }

    await Group.updateMany(
      {
        'members.userId': userId
      },
      {
        $pull: {
          members: {
            userId
          },
          keyPackages: {
            userId
          }
        }
      }
    );

    await User.updateMany(
      { 'friends.userId': userId },
      {
        $pull: {
          friends: {
            userId
          }
        }
      }
    );

    await User.updateMany(
      { 'friendRequests.from': userId },
      {
        $pull: {
          friendRequests: {
            from: userId
          }
        }
      }
    );

    await User.updateMany(
      { blockedUsers: userId },
      {
        $pull: {
          blockedUsers: userId
        }
      }
    );

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Compte et données supprimés définitivement'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function finalizeExpiredDeletions() {
  try {
    const cutoff = new Date(
      Date.now() - THIRTY_DAYS_MS
    );

    const expired = await User.find({
      pendingDeletionAt: {
        $ne: null,
        $lte: cutoff
      }
    });

    for (const user of expired) {
      user.password = await bcrypt.hash(
        Math.random().toString(36) + Date.now(),
        10
      );

      user.ipAlias = await generateUniqueIpAlias();
      user.realUsername = null;
      user.pendingDeletionAt = null;

      await user.save();
    }

    if (expired.length) {
      console.log(
        `🧹 ${expired.length} compte(s) définitivement anonymisé(s) après 30 jours`
      );
    }
  } catch (err) {
    console.error(
      'Erreur finalizeExpiredDeletions:',
      err
    );
  }
}

setInterval(
  finalizeExpiredDeletions,
  6 * 60 * 60 * 1000
);

finalizeExpiredDeletions();

module.exports = router;
