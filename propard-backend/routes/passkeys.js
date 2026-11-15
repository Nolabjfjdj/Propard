const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { createRateLimiter } = require('../middleware/rateLimit');

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
  keyFn: req => `passkey-login:${req.ip || 'unknown'}`,
  message: 'Trop de tentatives de connexion. Réessaie plus tard.'
});

const getWebAuthn = async () => import('@simplewebauthn/server');
const getOrigins = () => (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || 'https://propard.site')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const getRpId = () => process.env.WEBAUTHN_RP_ID || new URL(getOrigins()[0]).hostname;
const getExpectedOrigin = () => getOrigins();
const toBase64Url = value => Buffer.from(value).toString('base64url');
const hashRecoveryCode = value => crypto.createHash('sha256').update(value).digest('hex');
const makeRecoveryCodes = () => Array.from({ length: 10 }, () => {
  const value = crypto.randomBytes(6).toString('hex').toUpperCase();
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
const issueToken = user => require('jsonwebtoken').sign(
  {
    id: user._id,
    username: user.username,
    sessionVersion: user.sessionVersion || 0,
    jti: crypto.randomUUID()
  },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '7d' }
);
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
    return res.json({ passkeys: (user.passkeys || []).map(safeCredential), recoveryCodesAvailable: (user.passkeyRecoveryCodes || []).length > 0 });
  } catch (error) {
    console.error('Passkey list failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les clés d’accès.' });
  }
});

router.post('/register/options', auth, registrationLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    if (!password || password.length > 128) return res.status(400).json({ error: 'Mot de passe requis.' });
    const user = await User.findById(req.user.id).select('+password +passkeys');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!await bcrypt.compare(password, user.password || DUMMY_PASSWORD_HASH)) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
    const { generateRegistrationOptions } = await getWebAuthn();
    const options = await generateRegistrationOptions({
      rpName: 'Propard',
      rpID: getRpId(),
      userID: new Uint8Array(Buffer.from(user._id.toString())),
      userName: user.username,
      userDisplayName: user.displayName || user.username,
      attestationType: 'none',
      excludeCredentials: (user.passkeys || []).map(item => ({
        id: item.credentialId,
        transports: item.transports
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      timeout: 60000
    });
    user.passkeyRegistrationChallenge = options.challenge;
    user.passkeyRegistrationChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();
    return res.json({ options, suggestedName: name || 'Ma clé d’accès' });
  } catch (error) {
    console.error('Passkey registration options failed:', error);
    return res.status(500).json({ error: 'Impossible de préparer la création de la clé.' });
  }
});

router.post('/register/verify', auth, registrationLimiter, async (req, res) => {
  try {
    const response = req.body?.response;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    const user = await User.findById(req.user.id).select('+passkeys +passkeyRegistrationChallenge +passkeyRegistrationChallengeExpiresAt +passkeyRecoveryCodes');
    if (!user || !user.passkeyRegistrationChallenge || !user.passkeyRegistrationChallengeExpiresAt || user.passkeyRegistrationChallengeExpiresAt <= new Date()) {
      return res.status(400).json({ error: 'La demande a expiré. Recommence la création de la clé.' });
    }
    const { verifyRegistrationResponse } = await getWebAuthn();
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.passkeyRegistrationChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: false
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'La vérification de la clé a échoué.' });
    }
    const info = verification.registrationInfo;
    const credential = info.credential;
    const credentialId = credential.id;
    if ((user.passkeys || []).some(item => item.credentialId === credentialId)) {
      return res.status(409).json({ error: 'Cette clé est déjà associée au compte.' });
    }
    user.passkeys.push({
      credentialId,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || response.response?.transports || [],
      deviceType: info.credentialDeviceType || 'unknown',
      backedUp: !!info.credentialBackedUp,
      name: name || 'Clé d’accès',
      createdAt: new Date(),
      lastUsedAt: null
    });
    user.passkeyRegistrationChallenge = null;
    user.passkeyRegistrationChallengeExpiresAt = null;
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

router.post('/login/options', loginLimiter, async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || username.length > 64 || password.length > 128) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${escaped}$`, 'i') } }
      ]
    }).select('+password +passkeys');
    const matches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !matches || !user.passkeys?.length || user.bannedAt) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
    }
    const { generateAuthenticationOptions } = await getWebAuthn();
    const options = await generateAuthenticationOptions({
      rpID: getRpId(),
      allowCredentials: user.passkeys.map(item => ({
        id: item.credentialId,
        transports: item.transports
      })),
      userVerification: 'preferred',
      timeout: 60000
    });
    user.passkeyLoginChallenge = options.challenge;
    user.passkeyLoginChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
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
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${escaped}$`, 'i') } }
      ]
    }).select('+passkeys +passkeyLoginChallenge +passkeyLoginChallengeExpiresAt');
    if (!user || !user.passkeyLoginChallenge || !user.passkeyLoginChallengeExpiresAt || user.passkeyLoginChallengeExpiresAt <= new Date() || user.bannedAt) {
      return res.status(401).json({ error: 'Vérification expirée. Recommence la connexion.' });
    }
    const credentialId = response?.id;
    const stored = user.passkeys.find(item => item.credentialId === credentialId);
    if (!stored) return res.status(401).json({ error: 'Clé d’accès inconnue.' });
    const { verifyAuthenticationResponse } = await getWebAuthn();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.passkeyLoginChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, 'base64url'),
        counter: stored.counter,
        transports: stored.transports
      },
      requireUserVerification: false
    });
    if (!verification.verified) return res.status(401).json({ error: 'La clé d’accès n’a pas été validée.' });
    stored.counter = verification.authenticationInfo.newCounter;
    stored.lastUsedAt = new Date();
    user.passkeyLoginChallenge = null;
    user.passkeyLoginChallengeExpiresAt = null;
    await user.save();
    return res.json({ token: issueToken(user), user: publicUser(user) });
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
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { realUsername: { $regex: new RegExp(`^${escaped}$`, 'i') } }
      ]
    }).select('+password +passkeyRecoveryCodes');
    const matches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !matches || !user.passkeys?.length || user.bannedAt) return res.status(401).json({ error: 'Code de récupération invalide.' });
    const hashed = hashRecoveryCode(code);
    const index = user.passkeyRecoveryCodes.findIndex(value => {
      const a = Buffer.from(value, 'hex');
      const b = Buffer.from(hashed, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (index < 0) return res.status(401).json({ error: 'Code de récupération invalide.' });
    user.passkeyRecoveryCodes.splice(index, 1);
    await user.save();
    return res.json({ token: issueToken(user), user: publicUser(user), remainingRecoveryCodes: user.passkeyRecoveryCodes.length });
  } catch (error) {
    console.error('Passkey recovery failed:', error);
    return res.status(500).json({ error: 'Impossible d’utiliser le code de récupération.' });
  }
});

module.exports = router;
