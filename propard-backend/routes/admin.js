const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const StaffAuditLog = require('../models/StaffAuditLog');
const authMiddleware = require('../middleware/auth');
const { roleLevel } = require('../middleware/staffRoles');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getClientIp } = require('../utils/clientIp');

function requireSoleOwner(req, res, next) {
  if (req.user?.staffRole !== 'owner') {
    return res.status(403).json({ error: 'Accès réservé au propriétaire unique de Propard.' });
  }
  return next();
}

function checkAdminKey(providedKey) {
  const expectedKey = process.env.ADMIN_KEY;
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string' || !providedKey || !expectedKey) return false;
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

async function auditAdminAction(req, action, targetUser = null, details = null) {
  await StaffAuditLog.create({
    actor: req.user.id,
    action,
    targetUser,
    details,
    ip: typeof getClientIp(req) === 'string' ? getClientIp(req).slice(0, 128) : null,
    userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 512) : null
  });
}

const adminAccessLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: req => `admin-access:${req.user.id}`,
  message: 'Trop de consultations de la configuration administrateur. Réessaie plus tard.'
});
const adminSensitiveLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: req => getClientIp(req) || 'unknown',
  message: 'Trop de tentatives, réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});

router.get('/access', authMiddleware, requireSoleOwner, adminAccessLimiter, (req, res) => {
  return res.json({ success: true, owner: true });
});

function escapeRegex(value) {
  const special = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  return Array.from(value, character => special.has(character) ? '\\' + character : character).join('');
}

router.post('/reset-password', authMiddleware, requireSoleOwner, adminSensitiveLimiter, async (req, res) => {
  try {
    const { adminKey, username, newPassword, acknowledgeE2eeKeyBackupLoss } = req.body || {};

    if (!checkAdminKey(adminKey)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (typeof username !== 'string' || typeof newPassword !== 'string' || !username.trim() || !newPassword) {
      return res.status(400).json({ error: 'Username et nouveau mot de passe requis' });
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir entre 8 et 128 caractères' });
    }

    const safeUsername = escapeRegex(username.trim());
    const user = await User.findOne({ username: { $regex: new RegExp('^' + safeUsername + '$', 'i') } });

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (roleLevel(req.user.staffRole) <= roleLevel(user.staffRole || 'user')) {
      return res.status(403).json({ error: 'Tu ne peux pas réinitialiser le compte d’un membre du personnel de niveau égal ou supérieur.' });
    }

    if (user.e2eeKeyBackup && acknowledgeE2eeKeyBackupLoss !== true) {
      return res.status(409).json({
        error: 'La sauvegarde E2EE est chiffrée avec l’ancien mot de passe. Utilise la récupération assistée ou confirme explicitement la suppression de cette sauvegarde.',
        e2eeBackupAcknowledgementRequired: true
      });
    }

    const e2eeBackupCleared = Boolean(user.e2eeKeyBackup);
    user.password = await bcrypt.hash(newPassword, 10);
    if (e2eeBackupCleared) user.e2eeKeyBackup = null;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.activeSessions = [];
    await user.save();

    const disconnectUserSockets = req.app.get('disconnectUserSockets');
    if (typeof disconnectUserSockets === 'function') disconnectUserSockets(user._id);

    await auditAdminAction(req, 'user.password_reset.admin_override', user._id, {
      method: 'legacy-admin-reset',
      e2eeBackupCleared
    });

    return res.json({ success: true, message: 'Mot de passe de ' + user.username + ' réinitialisé' });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
