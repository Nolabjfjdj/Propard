const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getClientIp } = require('../utils/clientIp');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
const registrationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyFn: req => `passkey-register:${req.user.id}`,
  message: 'Trop de tentatives de création de clé. Réessaie plus tard.'
});
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: req => `passkey-login:${getClientIp(req) || 'unknown'}`,
  message: 'Trop de tentatives de connexion. Réessaie plus tard.'
});

const getWebAuthn = async () => import('@simplewebauthn/server');
const getOrigins = () => (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || 'https://propard.site')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const getRequestContext = req => {
  const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  let parsed;
  try {
    parsed = new URL(requestOrigin);
  } catch {
    throw new Error('Origine WebAuthn invalide.');
  }
  const origin = parsed.origin;
  const allowed = getOrigins().some(value => {
    try {
      return new URL(value).origin === origin;
    } catch {
      return false;
    }
  });
  if (!allowed || (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost')) {
    throw new Error('Origine WebAuthn non autorisée.');
  }
  return { origin, rpId: parsed.hostname };
};
const getLegacyRpId = () => process.env.WEBAUTHN_RP_ID || null;
const getCredentialRpId = item => item.rpId || getLegacyRpId();
const toBase64Url = value => Buffer.from(value).toString('base64url');
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hashRecoveryCode = value => crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex');
const makeRecoveryCodes = () => Array.from({ length: 10 }, () => {
  const value = crypto.randomBytes(8).toString('hex').toUpperCase();
  return value.match(/.{1,4}/g).join('-');
});
const safeCredential = item => ({
  id: item.credentialId,
  name: item.name,
  createdAt: item.createdAt,
  lastUsedAt: item.lastUsedAt,
  deviceType: item.deviceType,
  backedUp: item.backedUp
});
const issueToken = user => jwt.sign(
  {
    id: user._id,
    username: user.username,
    sessionVersion: user.sessionVersion || 0,
    jti: crypto.randomUUID()
  },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '7d' }
);
async function recordIssuedSession(userId, token, req, eventType = 'passkey_login') {
  const decoded = jwt.decode(token);
  if (!decoded?.jti || !decoded?.exp) return;
  const user = await User.findById(userId).select('+activeSessions +revokedSessions +securityEvents');
  if (!user) throw new Error('Utilisateur introuvable lors de la création de session.');
  const now = new Date();
  user.activeSessions = (user.activeSessions || []).filter(session => session.expiresAt > now);
  user.revokedSessions = (user.revokedSessions || []).filter(session => session.expiresAt > now);
  user.activeSessions.push({
    jti: decoded.jti,
    createdAt: now,
    expiresAt: new Date(decoded.exp * 1000),
    userAgent: String(req.get('user-agent') || '').slice(0, 300) || null
  });
  while (user.activeSessions.length > 10) {
    const oldest = user.activeSessions.shift();
    if (oldest.expiresAt > now) {
      user.revokedSessions.push({ jti: oldest.jti, expiresAt: oldest.expiresAt });
      const disconnect = req.app.get('disconnectUserSessionSockets');
      if (typeof disconnect === 'function') disconnect(userId, oldest.jti);
    }
  }
  user.revokedSessions = user.revokedSessions.slice(-100);
  user.securityEvents = [...(user.securityEvents || []), {
    eventType,
    createdAt: now,
    userAgent: String(req.get('user-agent') || '').slice(0, 300) || null
  }].slice(-50);
  await user.save();
}
const publicUser = user => ({
  id: user._id,
  username: user.username,
  displayName: user.displayName,
  avatar: user.avatar,
  ipAlias: user.ipAlias,
  publicKey: user.publicKey,
  pendingDeletion: !!user.pendingDeletionAt,
  deletionExpiresAt: user.pendingDeletionAt
    ? new Date(user.pendingDeletionAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null
});

router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+passkeys +passkeyRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    return res.json({
      passkeys: (user.passkeys || []).map(safeCredential),
      recoveryCodesAvailable: (user.passkeyRecoveryCodes || []).length > 0
    });
  } catch (error) {
    console.error('Passkey list failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les clés d’accès.' });
  }
});

router.post('/register/options', auth, registrationLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 128) return res.status(400).json({ error: 'Mot de passe requis.' });
    const user = await User.findById(req.user.id).select('+password +passkeys');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!await bcrypt.compare(password, user.password || DUMMY_PASSWORD_HASH)) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
    const { origin, rpId } = getRequestContext(req);
    const { generateRegistrationOptions } = await getWebAuthn();
    const options = await generateRegistrationOptions({
      rpName: 'Propard',
      rpID: rpId,
      userID: new Uint8Array(Buffer.from(user._id.toString())),
      userName: user.username,
      userDisplayName: user.displayName || user.username,
      attestationType: 'none',
      excludeCredentials: (user.passkeys || []).filter(item => getCredentialRpId(item) === rpId).map(item => ({
        id: item.credentialId,
        transports: item.transports
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required'
      },
      timeout: 60000
    });
    user.passkeyRegistrationChallenge = options.challenge;
    user.passkeyRegistrationChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    user.passkeyRegistrationRpId = rpId;
    user.passkeyRegistrationOrigin = origin;
    await user.save();
    return res.json({ options });
  } catch (error) {
    console.error('Passkey registration options failed:', error);
    return res.status(500).json({ error: 'Impossible de préparer la création de la clé.' });
  }
});

router.post('/register/verify', auth, registrationLimiter, async (req, res) => {
  try {
    const response = req.body?.response;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    const pendingUser = await User.findById(req.user.id).select('+passkeyRegistrationChallenge +passkeyRegistrationChallengeExpiresAt +passkeyRegistrationRpId +passkeyRegistrationOrigin');
    const challenge = pendingUser?.passkeyRegistrationChallenge;
    const requestContext = getRequestContext(req);
    if (!pendingUser || !challenge || !pendingUser.passkeyRegistrationChallengeExpiresAt || pendingUser.passkeyRegistrationChallengeExpiresAt <= new Date() || !pendingUser.passkeyRegistrationRpId || !pendingUser.passkeyRegistrationOrigin) {
      return res.status(400).json({ error: 'La demande a expiré. Recommence la création de la clé.' });
    }
    if (pendingUser.passkeyRegistrationRpId !== requestContext.rpId || pendingUser.passkeyRegistrationOrigin !== requestContext.origin) {
      return res.status(400).json({ error: 'La création de cette clé doit être terminée sur le même domaine.' });
    }
    const user = await User.findOneAndUpdate(
      {
        _id: pendingUser._id,
        passkeyRegistrationChallenge: challenge,
        passkeyRegistrationChallengeExpiresAt: { $gt: new Date() },
        passkeyRegistrationRpId: requestContext.rpId,
        passkeyRegistrationOrigin: requestContext.origin
      },
      {
        $set: {
          passkeyRegistrationChallenge: null,
          passkeyRegistrationChallengeExpiresAt: null,
          passkeyRegistrationRpId: null,
          passkeyRegistrationOrigin: null
        }
      },
      { new: true },
      '+passkeys +passkeyRecoveryCodes'
    );
    if (!user) return res.status(400).json({ error: 'Cette demande a déjà été utilisée. Recommence la création de la clé.' });
    const { verifyRegistrationResponse } = await getWebAuthn();
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: requestContext.origin,
      expectedRPID: requestContext.rpId,
      requireUserVerification: true
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'La vérification de la clé a échoué.' });
    }
    const info = verification.registrationInfo;
    const credential = info.credential;
    if ((user.passkeys || []).some(item => item.credentialId === credential.id)) {
      return res.status(409).json({ error: 'Cette clé est déjà associée au compte.' });
    }
    user.passkeys.push({
      credentialId: credential.id,
      rpId: requestContext.rpId,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || response.response?.transports || [],
      deviceType: info.credentialDeviceType || 'unknown',
      backedUp: !!info.credentialBackedUp,
      name: name || 'Clé d’accès',
      createdAt: new Date(),
      lastUsedAt: null
    });
    let recoveryCodes = [];
    if (!(user.passkeyRecoveryCodes || []).length) {
      recoveryCodes = makeRecoveryCodes();
      user.passkeyRecoveryCodes = recoveryCodes.map(hashRecoveryCode);
    }
    await user.save();
    return res.status(201).json({
      success: true,
      passkeys: user.passkeys.map(safeCredential),
      recoveryCodes
    });
  } catch (error) {
    console.error('Passkey registration verification failed:', error);
    return res.status(400).json({ error: 'Impossible de vérifier cette clé d’accès.' });
  }
});

router.patch('/:credentialId', auth, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 40) return res.status(400).json({ error: 'Nom invalide (1 à 40 caractères).' });
    const user = await User.findById(req.user.id).select('+passkeys');
    const item = user?.passkeys?.find(entry => entry.credentialId === req.params.credentialId);
    if (!item) return res.status(404).json({ error: 'Clé d’accès introuvable.' });
    item.name = name;
    await user.save();
    return res.json({ success: true, passkeys: user.passkeys.map(safeCredential) });
  } catch (error) {
    console.error('Passkey rename failed:', error);
    return res.status(500).json({ error: 'Impossible de renommer cette clé.' });
  }
});

router.delete('/:credentialId', auth, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 128) return res.status(400).json({ error: 'Mot de passe requis.' });
    const user = await User.findById(req.user.id).select('+password +passkeys +passkeyRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!await bcrypt.compare(password, user.password || DUMMY_PASSWORD_HASH)) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
    const before = user.passkeys.length;
    user.passkeys = user.passkeys.filter(item => item.credentialId !== req.params.credentialId);
    if (user.passkeys.length === before) return res.status(404).json({ error: 'Clé d’accès introuvable.' });
    if (!user.passkeys.length) user.passkeyRecoveryCodes = [];
    await user.save();
    return res.json({ success: true, passkeys: user.passkeys.map(safeCredential) });
  } catch (error) {
    console.error('Passkey deletion failed:', error);
    return res.status(500).json({ error: 'Impossible de supprimer cette clé.' });
  }
});

router.post('/recovery/regenerate', auth, registrationLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 128) return res.status(400).json({ error: 'Mot de passe requis.' });
    const user = await User.findById(req.user.id).select('+password +passkeys +passkeyRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!user.passkeys?.length) return res.status(400).json({ error: 'Ajoute une clé d’accès avant de créer des codes.' });
    if (!await bcrypt.compare(password, user.password || DUMMY_PASSWORD_HASH)) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
    const recoveryCodes = makeRecoveryCodes();
    user.passkeyRecoveryCodes = recoveryCodes.map(hashRecoveryCode);
    await user.save();
    return res.json({ success: true, recoveryCodes });
  } catch (error) {
    console.error('Passkey recovery code regeneration failed:', error);
    return res.status(500).json({ error: 'Impossible de régénérer les codes de récupération.' });
  }
});

router.post('/login/options', loginLimiter, async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || username.length > 64 || password.length > 128) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } },
        { realUsername: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } }
      ]
    }).select('+password +passkeys');
    const matches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !matches || !user.passkeys?.length || user.bannedAt) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
    }
    const { origin, rpId } = getRequestContext(req);
    const { generateAuthenticationOptions } = await getWebAuthn();
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: user.passkeys.filter(item => getCredentialRpId(item) === rpId).map(item => ({
        id: item.credentialId,
        transports: item.transports
      })),
      userVerification: 'required',
      timeout: 60000
    });
    user.passkeyLoginChallenge = options.challenge;
    user.passkeyLoginChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    user.passkeyLoginRpId = rpId;
    user.passkeyLoginOrigin = origin;
    await user.save();
    return res.json({ options });
  } catch (error) {
    console.error('Passkey login options failed:', error);
    return res.status(500).json({ error: 'Impossible de préparer la vérification de la clé.' });
  }
});

router.post('/login/verify', loginLimiter, async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const response = req.body?.response;
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } },
        { realUsername: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } }
      ]
    }).select('+passkeyLoginChallenge +passkeyLoginChallengeExpiresAt +passkeyLoginRpId +passkeyLoginOrigin');
    const challenge = user?.passkeyLoginChallenge;
    const requestContext = getRequestContext(req);
    if (!user || !challenge || !user.passkeyLoginChallengeExpiresAt || user.passkeyLoginChallengeExpiresAt <= new Date() || user.bannedAt || !user.passkeyLoginRpId || !user.passkeyLoginOrigin) {
      return res.status(401).json({ error: 'Vérification expirée. Recommence la connexion.' });
    }
    const claimedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        passkeyLoginChallenge: challenge,
        passkeyLoginChallengeExpiresAt: { $gt: new Date() },
        passkeyLoginRpId: requestContext.rpId,
        passkeyLoginOrigin: requestContext.origin
      },
      {
        $set: {
          passkeyLoginChallenge: null,
          passkeyLoginChallengeExpiresAt: null,
          passkeyLoginRpId: null,
          passkeyLoginOrigin: null
        }
      },
      { new: true },
      '+passkeys'
    );
    if (!claimedUser) return res.status(401).json({ error: 'Cette vérification a déjà été utilisée. Recommence la connexion.' });
    if (user.passkeyLoginRpId !== requestContext.rpId || user.passkeyLoginOrigin !== requestContext.origin) {
      return res.status(401).json({ error: 'La connexion doit être terminée sur le même domaine.' });
    }
    const credentialId = response?.id;
    const stored = claimedUser.passkeys.find(item => item.credentialId === credentialId && getCredentialRpId(item) === requestContext.rpId);
    if (!stored) return res.status(401).json({ error: 'Clé d’accès inconnue.' });
    const { verifyAuthenticationResponse } = await getWebAuthn();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: requestContext.origin,
      expectedRPID: requestContext.rpId,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
        counter: stored.counter,
        transports: stored.transports
      },
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(401).json({ error: 'La clé d’accès n’a pas été validée.' });
    stored.counter = verification.authenticationInfo.newCounter;
    stored.lastUsedAt = new Date();
    await claimedUser.save();
    const token = issueToken(claimedUser);
    await recordIssuedSession(claimedUser._id, token, req);
    return res.json({ token, user: publicUser(claimedUser) });
  } catch (error) {
    console.error('Passkey login verification failed:', error);
    return res.status(401).json({ error: 'La vérification de la clé d’accès a échoué.' });
  }
});

router.post('/login/recovery', loginLimiter, async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!username || !password || !code || code.length > 20) return res.status(400).json({ error: 'Informations invalides.' });
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } },
        { realUsername: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') } }
      ]
    }).select('+password +passkeys +passkeyRecoveryCodes');
    const matches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !matches || !user.passkeys?.length || user.bannedAt) {
      return res.status(401).json({ error: 'Code de récupération invalide.' });
    }
    const hashed = hashRecoveryCode(code);
    const claimedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        passkeyRecoveryCodes: hashed
      },
      {
        $pull: {
          passkeyRecoveryCodes: hashed
        }
      },
      { new: true },
      '+passkeyRecoveryCodes'
    );
    if (!claimedUser) return res.status(401).json({ error: 'Code de récupération invalide ou déjà utilisé.' });
    const token = issueToken(claimedUser);
    await recordIssuedSession(claimedUser._id, token, req, 'recovery_code_login');
    return res.json({
      token,
      user: publicUser(claimedUser),
      remainingRecoveryCodes: claimedUser.passkeyRecoveryCodes.length
    });
  } catch (error) {
    console.error('Passkey recovery failed:', error);
    return res.status(500).json({ error: 'Impossible d’utiliser le code de récupération.' });
  }
});

module.exports = router;
