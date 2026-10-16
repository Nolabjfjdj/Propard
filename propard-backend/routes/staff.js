const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const Report = require('../models/Report');
const StaffAuditLog = require('../models/StaffAuditLog');
const authMiddleware = require('../middleware/auth');
const { ROLE_LEVELS, roleLevel, requireStaffRole, canManageRole } = require('../middleware/staffRoles');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const actionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: req => req.user?.id || req.ip || 'unknown',
  message: 'Trop d’actions en peu de temps. Réessaie plus tard.'
});

const resetCompleteLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => req.ip || 'unknown',
  message: 'Trop de tentatives de récupération. Réessaie plus tard.'
});

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) {
    return false;
  }
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function audit(req, action, { targetUser = null, targetReport = null, details = null } = {}) {
  await StaffAuditLog.create({
    actor: req.user.id,
    action,
    targetUser,
    targetReport,
    details,
    ip: typeof req.ip === 'string' ? req.ip.slice(0, 128) : null,
    userAgent: typeof req.get('user-agent') === 'string'
      ? req.get('user-agent').slice(0, 512)
      : null
  });
}

async function findTargetUser(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findById(userId).select('_id username displayName staffRole bannedAt banExpiresAt banReason sessionVersion isOnline');
}

function actorCanManageTarget(actorRole, targetRole) {
  return roleLevel(actorRole) > roleLevel(targetRole || 'user');
}

/*
 * Public completion endpoint: the staff member never chooses or sees the
 * user's new password. The one-time token expires after 15 minutes.
 */
router.post('/password-reset/complete', resetCompleteLimiter, async (req, res) => {
  try {
    const { token, newPassword, acknowledgeE2eeKeyBackupLoss } = req.body || {};

    if (typeof token !== 'string' || token.length < 32 || token.length > 200 ||
        typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'Code de récupération ou mot de passe invalide.' });
    }

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() }
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.status(400).json({ error: 'Code de récupération invalide ou expiré.' });
    }

    if (user.e2eeKeyBackup && acknowledgeE2eeKeyBackupLoss !== true) {
      return res.status(409).json({
        error: 'La sauvegarde E2EE est chiffrée avec l’ancien mot de passe. Pour continuer, confirme que tu comprends que cette sauvegarde sera supprimée et que seuls les appareils possédant encore la clé privée locale pourront en créer une nouvelle.',
        e2eeBackupAcknowledgementRequired: true
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    if (user.e2eeKeyBackup) {
      user.e2eeKeyBackup = null;
    }
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();

    return res.json({
      success: true,
      message: 'Mot de passe modifié. Reconnecte-toi sur tes appareils.'
    });
  } catch (error) {
    console.error('Staff password reset completion failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.use(authMiddleware);
router.use(actionLimiter);

/*
 * One-time bootstrap: the first owner must be an authenticated account and
 * must also know the server-only bootstrap secret. Once staff roles exist,
 * this route can no longer create another owner.
 */
router.post('/bootstrap', async (req, res) => {
  try {
    const expectedSecret = process.env.STAFF_BOOTSTRAP_KEY || process.env.ADMIN_KEY;
    if (!safeEqual(req.body?.bootstrapKey, expectedSecret)) {
      return res.status(403).json({ error: 'Clé de configuration invalide.' });
    }

    const existingStaff = await User.countDocuments({ staffRole: { $ne: 'user' } });
    if (existingStaff > 0) {
      return res.status(409).json({ error: 'Le personnel est déjà configuré.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });

    user.staffRole = 'owner';
    user.staffRoleUpdatedAt = new Date();
    user.staffRoleUpdatedBy = user._id;
    await user.save();

    req.user.staffRole = 'owner';
    await audit(req, 'staff.bootstrap.completed', { targetUser: user._id });

    return res.json({ success: true, staffRole: 'owner' });
  } catch (error) {
    console.error('Staff bootstrap failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/me', requireStaffRole('support'), (req, res) => {
  res.json({
    staffRole: req.user.staffRole,
    permissions: Object.entries(ROLE_LEVELS)
      .filter(([, level]) => level <= roleLevel(req.user.staffRole))
      .map(([role]) => role)
  });
});

router.get('/reports', requireStaffRole('junior_moderator'), async (req, res) => {
  try {
    const status = ['new', 'processed', 'rejected'].includes(req.query.status)
      ? req.query.status
      : null;
    const filter = status ? { status } : {};
    const reports = await Report.find(filter)
      .select('-content -conversationSnapshot')
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('reporter', 'username displayName')
      .populate('reportedUser', 'username displayName')
      .lean();

    return res.json({ reports });
  } catch (error) {
    console.error('Staff report list failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/reports/:reportId', requireStaffRole('junior_moderator'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reportId)) {
      return res.status(400).json({ error: 'Signalement invalide.' });
    }

    const report = await Report.findById(req.params.reportId)
      .populate('reporter', 'username displayName')
      .populate('reportedUser', 'username displayName');

    if (!report) return res.status(404).json({ error: 'Signalement introuvable.' });

    if (report.reportScope === 'conversation' && roleLevel(req.user.staffRole) < roleLevel('senior_moderator')) {
      return res.status(403).json({ error: 'Une autorisation de modération senior est requise pour consulter une conversation complète.' });
    }

    await audit(req, report.reportScope === 'conversation'
      ? 'report.conversation.viewed'
      : 'report.message.viewed', { targetReport: report._id });

    return res.json({ report });
  } catch (error) {
    console.error('Staff report detail failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.patch('/reports/:reportId/status', requireStaffRole('junior_moderator'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reportId)) {
      return res.status(400).json({ error: 'Signalement invalide.' });
    }
    const { status } = req.body || {};
    if (!['new', 'processed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Signalement introuvable.' });

    const previousStatus = report.status;
    report.status = status;
    report.processedAt = status === 'new' ? null : new Date();
    await report.save();
    await audit(req, 'report.status.updated', {
      targetReport: report._id,
      details: { previousStatus, status }
    });

    return res.json({ success: true, status: report.status, processedAt: report.processedAt });
  } catch (error) {
    console.error('Staff report status update failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/users/:userId/ban', requireStaffRole('moderator'), async (req, res) => {
  try {
    const target = await findTargetUser(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole)) {
      return res.status(403).json({ error: 'Tu ne peux pas sanctionner un membre du personnel de niveau égal ou supérieur.' });
    }

    const { duration, reason } = req.body || {};
    const durations = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      return res.status(400).json({ error: 'Un motif de 3 à 500 caractères est requis.' });
    }
    if (duration === 'permanent' && roleLevel(req.user.staffRole) < roleLevel('senior_moderator')) {
      return res.status(403).json({ error: 'Seuls les modérateurs seniors et les administrateurs peuvent appliquer un bannissement permanent.' });
    }
    if (duration !== 'permanent' && !Object.prototype.hasOwnProperty.call(durations, duration)) {
      return res.status(400).json({ error: 'Durée de bannissement invalide.' });
    }

    const durationMs = duration === 'permanent' ? null : durations[duration];
    target.bannedAt = new Date();
    target.banExpiresAt = durationMs === null ? null : new Date(Date.now() + durationMs);
    target.banReason = reason.trim();
    target.sessionVersion = (target.sessionVersion || 0) + 1;
    target.isOnline = false;
    await target.save();

    const io = req.app.get('io');
    if (io) {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.userId?.toString() === target._id.toString()) {
          socket.emit('accountBanned', { message: 'Ton compte a été banni de Propard.' });
          socket.disconnect(true);
        }
      }
    }

    await audit(req, 'user.banned', {
      targetUser: target._id,
      details: { duration, reason: reason.trim(), banExpiresAt: target.banExpiresAt }
    });

    return res.json({
      success: true,
      user: {
        _id: target._id,
        username: target.username,
        bannedAt: target.bannedAt,
        banExpiresAt: target.banExpiresAt,
        banReason: target.banReason
      }
    });
  } catch (error) {
    console.error('Staff ban failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/users/:userId/unban', requireStaffRole('moderator'), async (req, res) => {
  try {
    const target = await findTargetUser(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole)) {
      return res.status(403).json({ error: 'Tu ne peux pas modifier les sanctions d’un membre du personnel de niveau égal ou supérieur.' });
    }
    if (!target.bannedAt) return res.status(400).json({ error: 'Ce compte n’est pas banni.' });

    target.bannedAt = null;
    target.banExpiresAt = null;
    target.banReason = null;
    target.sessionVersion = (target.sessionVersion || 0) + 1;
    await target.save();

    await audit(req, 'user.unbanned', { targetUser: target._id });
    return res.json({ success: true, message: 'Compte débanni.' });
  } catch (error) {
    console.error('Staff unban failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/users/:userId/password-reset', requireStaffRole('support'), async (req, res) => {
  try {
    const target = await findTargetUser(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole)) {
      return res.status(403).json({ error: 'Tu ne peux pas lancer la récupération du compte d’un membre du personnel de niveau égal ou supérieur.' });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    target.passwordResetTokenHash = hashToken(token);
    target.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await target.save();

    await audit(req, 'user.password_reset.issued', {
      targetUser: target._id,
      details: { expiresAt: target.passwordResetExpiresAt }
    });

    return res.json({
      success: true,
      resetToken: token,
      expiresAt: target.passwordResetExpiresAt,
      warning: 'Ce code est affiché une seule fois. Transmets-le au propriétaire du compte par un canal vérifié.'
    });
  } catch (error) {
    console.error('Staff password reset issuance failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.patch('/users/:userId/role', requireStaffRole('admin'), async (req, res) => {
  try {
    const target = await findTargetUser(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
    const { staffRole } = req.body || {};

    if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, staffRole) || staffRole === 'user') {
      return res.status(400).json({ error: 'Rôle du personnel invalide.' });
    }
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole) ||
        !canManageRole(req.user.staffRole, staffRole)) {
      return res.status(403).json({ error: 'Tu ne peux pas attribuer ou modifier ce niveau de rôle.' });
    }

    const previousRole = target.staffRole || 'user';
    target.staffRole = staffRole;
    target.staffRoleUpdatedAt = new Date();
    target.staffRoleUpdatedBy = new mongoose.Types.ObjectId(req.user.id);
    await target.save();

    await audit(req, 'staff.role.updated', {
      targetUser: target._id,
      details: { previousRole, staffRole }
    });

    return res.json({ success: true, username: target.username, staffRole });
  } catch (error) {
    console.error('Staff role update failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/audit', requireStaffRole('admin'), async (req, res) => {
  try {
    const logs = await StaffAuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actor', 'username displayName staffRole')
      .populate('targetUser', 'username displayName staffRole')
      .populate('targetReport', 'status reportScope createdAt')
      .lean();
    return res.json({ logs });
  } catch (error) {
    console.error('Staff audit log retrieval failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
