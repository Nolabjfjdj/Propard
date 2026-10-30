const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const SupportRequest = require('../models/SupportRequest');
const { sendStaffHelpNotification } = require('../services/push');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { MAX_AVATAR_LENGTH } = require('../utils/inputValidation');

const accountHelpLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 4,
  keyFn: req => `account-help:${req.ip || 'unknown'}`,
  message: 'Trop de demandes envoyées. Réessaie plus tard.'
});

const accountHelpStatusLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 20,
  keyFn: req => `account-help-status:${req.ip || 'unknown'}`,
  message: 'Trop de consultations. Réessaie plus tard.'
});

const profileUpdateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => `profile-update:${req.user.id}`,
  message: 'Trop de modifications du profil. Réessaie dans quelques minutes.',
  captcha: true,
  resetOnCaptcha: true
});
const keyChangeLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => `key-change:${req.user.id}`,
  message: 'Trop de modifications de clé. Réessaie dans quelques minutes.',
  captcha: true,
  resetOnCaptcha: true
});
const keyBackupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: req => `key-backup:${req.user.id}`,
  message: 'Trop de modifications de sauvegarde. Réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});
const keyBackupReadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => `key-backup-read:${req.user.id}`,
  message: 'Trop de récupérations de sauvegarde. Réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});
const accountDeletionLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 2,
  keyFn: req => `account-delete:${req.user.id}`,
  message: 'Trop de tentatives de suppression du compte. Réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});
const logoutAllLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyFn: req => `logout-all:${req.user.id}`,
  message: 'Trop de demandes de déconnexion globale. Réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});

const accountRestoreLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyFn: req => `account-restore:${req.user.id}`,
  message: 'Trop de tentatives de restauration. Réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});

const PSEUDOS_INTERDITS = ['owner','admin','administrator','superadmin','sysadmin','moderator','mod','comod','staff','team','crew','support','helpdesk','official','propard','propardbot','propardteam','propardstaff','propardadmin','propardsupport','propardofficial','everyone','nigger','nigga','faggot','retard','whore','bitch','salope','pute','connard','connasse','batard','batarde','enculé','encule','fdp','ntm','tg','pd','discord','telegram','whatsapp','snapchat','instagram','kkk','facebook','twitter','tiktok','youtube','google','microsoft','apple','amazon','netflix','spotify','twitch','reddit','github','anthropic','openai','chatgpt','claude','malware','virus','phishing','scam','billing','privacy','terms','rules','guidelines','policy'];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isBase64(value, expectedBytes = null) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return false;
  }

  const decoded = Buffer.from(value, 'base64');

  return (
    decoded.toString('base64') === value &&
    (expectedBytes === null || decoded.length === expectedBytes)
  );
}

function isP256Coordinate(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').length === 32
  );
}

function hashAccountHelpToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function encryptRecoveryCode(token) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decryptRecoveryCode(value) {
  if (!value || !process.env.JWT_SECRET) return null;
  try {
    const payload = Buffer.from(value, 'base64url');
    if (payload.length < 29) return null;
    const key = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      sessionVersion: user.sessionVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

const escapeRegExp = value =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}:${typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : ''}`,
  message: 'Trop de tentatives de connexion, réessaie dans quelques minutes.',
  captcha: true
});

const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyFn: (req) => req.ip,
  message: 'Trop de comptes créés depuis cette adresse, réessaie plus tard.',
  captcha: true
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

router.post('/account-help', accountHelpLimiter, async (req, res) => {
  try {
    const { username, kind, message } = req.body || {};
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';

    if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      return res.status(400).json({ error: 'Entre un pseudo Propard valide de 3 à 20 caractères.' });
    }
    if (!['password_reset', 'support'].includes(kind)) {
      return res.status(400).json({ error: 'Type de demande invalide.' });
    }
    if (normalizedMessage.length < 20 || normalizedMessage.length > 1500) {
      return res.status(400).json({ error: 'Explique ta demande en 20 à 1500 caractères pour que le personnel puisse l’étudier.' });
    }

    const account = await User.findOne({
      username: { $regex: new RegExp('^' + escapeRegExp(normalizedUsername) + '$', 'i') }
    }).select('_id username');
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const publicReference = crypto.randomBytes(8).toString('hex').toUpperCase();
    const supportRequest = await SupportRequest.create({
      kind,
      username: account?.username || normalizedUsername,
      userId: account?._id || null,
      message: normalizedMessage,
      messages: [{ senderType: 'user', senderName: account?.username || normalizedUsername, text: normalizedMessage }],
      publicReference,
      accessTokenHash: hashAccountHelpToken(accessToken)
    });

    void sendStaffHelpNotification({
      kind,
      username: normalizedUsername,
      requestId: supportRequest._id
    }).catch(error => {
      console.error('Account-help push delivery failed:', error.message);
    });

    return res.status(202).json({
      success: true,
      reference: publicReference,
      accessToken,
      message: 'Ta demande a été transmise au panneau du personnel. Garde la référence et la clé d’accès : elles permettent de consulter la réponse ici, sans e-mail.'
    });
  } catch (error) {
    console.error('Account help request failed:', error);
    return res.status(500).json({ error: 'Impossible d’envoyer la demande pour le moment.' });
  }
});

router.post('/account-help/message', accountHelpStatusLimiter, async (req, res) => {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().toUpperCase() : '';
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!/^[A-F0-9]{16}$/.test(reference) || accessToken.length < 32 || accessToken.length > 100) {
      return res.status(400).json({ error: 'Lien de conversation invalide.' });
    }
    if (message.length < 1 || message.length > 1500) {
      return res.status(400).json({ error: 'Le message doit contenir entre 1 et 1500 caractères.' });
    }
    const supportRequest = await SupportRequest.findOne({ publicReference: reference }).select('+accessTokenHash');
    if (!supportRequest || !supportRequest.accessTokenHash) {
      return res.status(404).json({ error: 'Conversation introuvable.' });
    }
    const suppliedHash = Buffer.from(hashAccountHelpToken(accessToken), 'hex');
    const storedHash = Buffer.from(supportRequest.accessTokenHash, 'hex');
    if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
      return res.status(404).json({ error: 'Conversation introuvable.' });
    }
    if (supportRequest.status === 'resolved') {
      return res.status(409).json({ error: 'Cette demande est résolue. Contacte à nouveau le support si tu as encore besoin d’aide.' });
    }
    supportRequest.messages.push({
      senderType: 'user',
      senderName: supportRequest.username,
      text: message,
      createdAt: new Date()
    });
    supportRequest.updatedAt = new Date();
    if (supportRequest.status === 'new') supportRequest.status = 'in_progress';
    await supportRequest.save();
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Account help message failed:', error);
    return res.status(500).json({ error: 'Impossible d’envoyer le message.' });
  }
});

router.post('/account-help/status', accountHelpStatusLimiter, async (req, res) => {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().toUpperCase() : '';
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    if (!/^[A-F0-9]{16}$/.test(reference) || accessToken.length < 32 || accessToken.length > 100) {
      return res.status(400).json({ error: 'Référence ou clé d’accès invalide.' });
    }

    const supportRequest = await SupportRequest.findOne({ publicReference: reference })
      .select('+accessTokenHash +recoveryCodeEncrypted')
      .lean();
    if (!supportRequest || !supportRequest.accessTokenHash) {
      return res.status(404).json({ error: 'Demande introuvable ou clé d’accès incorrecte.' });
    }
    const suppliedHash = Buffer.from(hashAccountHelpToken(accessToken), 'hex');
    const storedHash = Buffer.from(supportRequest.accessTokenHash, 'hex');
    if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
      return res.status(404).json({ error: 'Demande introuvable ou clé d’accès incorrecte.' });
    }

    const recoveryCode = supportRequest.recoveryCodeExpiresAt &&
      new Date(supportRequest.recoveryCodeExpiresAt) > new Date()
      ? decryptRecoveryCode(supportRequest.recoveryCodeEncrypted)
      : null;

    return res.json({
      success: true,
      reference: supportRequest.publicReference,
      kind: supportRequest.kind,
      username: supportRequest.username,
      status: supportRequest.status,
      createdAt: supportRequest.createdAt,
      updatedAt: supportRequest.updatedAt,
      staffReply: supportRequest.staffReply || '',
      messages: (supportRequest.messages || []).map(item => ({
        senderType: item.senderType,
        senderName: item.senderName,
        text: item.text,
        createdAt: item.createdAt
      })),
      recoveryCode,
      recoveryCodeExpiresAt: recoveryCode ? supportRequest.recoveryCodeExpiresAt : null
    });
  } catch (error) {
    console.error('Account-help status retrieval failed:', error);
    return res.status(500).json({ error: 'Impossible de consulter cette demande.' });
  }
});

router.post('/register', registerRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username et mot de passe requis' });
    }

    if (username.length < 3 || username.length > 16) {
      return res.status(400).json({ error: 'Username entre 3 et 16 caractères' });
    }

    const lower = username.toLowerCase();
    const usernamePattern = escapeRegExp(username);

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

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: 'Mot de passe entre 8 et 128 caractères'
      });
    }

    const existing = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${usernamePattern}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${usernamePattern}$`, 'i') } }
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

    const token = signToken(user);

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

    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 128) {
      return res.status(400).json({
        error: 'Identifiants invalides'
      });
    }

    const usernamePattern = escapeRegExp(username);

    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${usernamePattern}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${usernamePattern}$`, 'i') } }
      ]
    }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({
        error: 'Pseudo ou mot de passe incorrect'
      });
    }

    if (user.bannedAt && user.banExpiresAt && user.banExpiresAt <= new Date()) {
      user.bannedAt = null;
      user.banExpiresAt = null;
      user.banReason = null;
      user.sessionVersion += 1;
      await user.save();
    } else if (user.bannedAt) {
      return res.status(403).json({
        error: 'Ce compte a été banni de Propard.'
      });
    }

    const token = signToken(user);

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


router.post('/logout-all', authMiddleware, logoutAllLimiter, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { sessionVersion: 1 } },
      { new: true, select: '_id sessionVersion' }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const disconnectUserSockets = req.app.get('disconnectUserSockets');
    if (typeof disconnectUserSockets === 'function') {
      disconnectUserSockets(req.user.id);
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('_id username displayName avatar ipAlias publicKey isOnline friends friendRequests pendingDeletionAt')
      .populate(
        'friends.userId',
        'username displayName avatar ipAlias isOnline publicKey'
      );

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const pendingDeletion = !!user.pendingDeletionAt;
    const deletionExpiresAt = user.pendingDeletionAt
      ? new Date(user.pendingDeletionAt.getTime() + THIRTY_DAYS_MS)
      : null;

    res.json({
      _id: user._id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      ipAlias: user.ipAlias,
      publicKey: user.publicKey,
      isOnline: user.isOnline,
      friends: user.friends,
      friendRequests: user.friendRequests,
      pendingDeletion,
      deletionExpiresAt
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/me', authMiddleware, profileUpdateLimiter, async (req, res) => {
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
        avatar.length > MAX_AVATAR_LENGTH
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

router.patch('/publickey', authMiddleware, keyChangeLimiter, async (req, res) => {
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
      !isP256Coordinate(parsed.x) ||
      !isP256Coordinate(parsed.y) ||
      Object.prototype.hasOwnProperty.call(parsed, 'd')
    ) {
      return res.status(400).json({
        error: 'Clé publique invalide'
      });
    }

    const sanitizedPublicKey = {
      kty: 'EC',
      crv: 'P-256',
      x: parsed.x,
      y: parsed.y,
      ext: true,
      key_ops: []
    };

    await User.findByIdAndUpdate(
      req.user.id,
      { publicKey: JSON.stringify(sanitizedPublicKey) }
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/keybackup', authMiddleware, keyBackupReadLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('e2eeKeyBackup');

    if (!user) {
      return res.status(404).json({
        error: 'Compte introuvable'
      });
    }

    res.json({
      backup: user.e2eeKeyBackup || null
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

router.post('/keybackup', authMiddleware, keyBackupLimiter, async (req, res) => {
  try {
    const { backup } = req.body;

    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({
        error: 'Sauvegarde E2EE invalide'
      });
    }

    const requiredStrings = [
      'algorithm',
      'kdf',
      'salt',
      'iv',
      'ciphertext'
    ];

    if (
      backup.version !== 1 ||
      !requiredStrings.every(
        key => typeof backup[key] === 'string'
      ) ||
      backup.algorithm !== 'AES-256-GCM' ||
      backup.kdf !== 'PBKDF2-SHA-256' ||
      backup.iterations !== 600000
    ) {
      return res.status(400).json({
        error: 'Sauvegarde E2EE invalide'
      });
    }

    if (
      !isBase64(backup.salt, 16) ||
      !isBase64(backup.iv, 12) ||
      !isBase64(backup.ciphertext) ||
      Buffer.from(backup.ciphertext, 'base64').length < 16 ||
      backup.ciphertext.length > 10000
    ) {
      return res.status(400).json({
        error: 'Sauvegarde E2EE trop volumineuse'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Compte introuvable'
      });
    }

    user.e2eeKeyBackup = {
      version: 1,
      algorithm: backup.algorithm,
      kdf: backup.kdf,
      iterations: backup.iterations,
      salt: backup.salt,
      iv: backup.iv,
      ciphertext: backup.ciphertext,
      updatedAt: new Date()
    };

    await user.save();

    res.json({
      success: true
    });
  } catch (e) {
    console.error('POST /keybackup:', e);
    res.status(500).json({
      error: 'Impossible d’enregistrer la sauvegarde E2EE'
    });
  }
});

router.delete('/anonymize', authMiddleware, accountDeletionLimiter, async (req, res) => {
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

router.post('/cancel-deletion', authMiddleware, accountRestoreLimiter, async (req, res) => {
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

router.delete('/delete', authMiddleware, accountDeletionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const disconnectUserSockets = req.app.get('disconnectUserSockets');
    if (typeof disconnectUserSockets === 'function') {
      disconnectUserSockets(userId);
    }

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
      user.e2eeKeyBackup = null;

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
