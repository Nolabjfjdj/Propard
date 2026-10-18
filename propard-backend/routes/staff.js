const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const Report = require('../models/Report');
const StaffAuditLog = require('../models/StaffAuditLog');
const SupportRequest = require('../models/SupportRequest');
const authMiddleware = require('../middleware/auth');
const { ROLE_LEVELS, roleLevel, requireStaffRole, canManageRole } = require('../middleware/staffRoles');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const actionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyFn: req => req.user && req.user.id ? req.user.id : req.ip || 'unknown',
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

function escapeRegex(value) {
  const special = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  return Array.from(value, character => special.has(character) ? '\\' + character : character).join('');
}

async function audit(req, action, options = {}) {
  const actorId = options.actor || req.user.id;
  const targetUserId = options.targetUser || null;
  const [actorUser, targetUser] = await Promise.all([
    User.findById(actorId).select('username').lean().catch(() => null),
    targetUserId ? User.findById(targetUserId).select('username').lean().catch(() => null) : Promise.resolve(null)
  ]);
  await StaffAuditLog.create({
    actor: actorId,
    actorUsername: actorUser?.username || req.user?.username || null,
    action,
    targetUser: targetUserId,
    targetUsername: targetUser?.username || options.targetUsername || options.details?.username || null,
    targetReport: options.targetReport || null,
    details: options.details || null,
    ip: typeof req.ip === 'string' ? req.ip.slice(0, 128) : null,
    userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 512) : null
  });
}

async function findTargetUser(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findById(userId).select('_id username displayName staffRole bannedAt banExpiresAt banReason sessionVersion isOnline');
}

function actorCanManageTarget(actorRole, targetRole) {
  return canManageRole(actorRole, targetRole || 'user');
}

router.post('/password-reset/complete', resetCompleteLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const token = body.token;
    const newPassword = body.newPassword;
    const acknowledgeE2eeKeyBackupLoss = body.acknowledgeE2eeKeyBackupLoss;

    if (typeof token !== 'string' || token.length < 32 || token.length > 200 ||
        typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'Code de récupération ou mot de passe invalide.' });
    }

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() }
    }).select('+passwordResetTokenHash +passwordResetExpiresAt +passwordResetIssuedBy');

    if (!user) {
      return res.status(400).json({ error: 'Code de récupération invalide ou expiré.' });
    }

    if (user.e2eeKeyBackup && acknowledgeE2eeKeyBackupLoss !== true) {
      return res.status(409).json({
        error: 'La sauvegarde E2EE est chiffrée avec l’ancien mot de passe. Pour continuer, confirme que tu comprends que cette sauvegarde sera supprimée et que seuls les appareils possédant encore la clé privée locale pourront en créer une nouvelle.',
        e2eeBackupAcknowledgementRequired: true
      });
    }

    const resetIssuedBy = user.passwordResetIssuedBy || user._id;
    const e2eeBackupCleared = Boolean(user.e2eeKeyBackup);

    user.password = await bcrypt.hash(newPassword, 10);
    if (e2eeBackupCleared) user.e2eeKeyBackup = null;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.passwordResetIssuedBy = null;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();

    await audit(req, 'user.password_reset.completed', {
      actor: resetIssuedBy,
      targetUser: user._id,
      details: { e2eeBackupCleared }
    });

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

router.get('/notifications/preferences', requireStaffRole('support'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('staffNotificationPreferences').lean();
    const preferences = user?.staffNotificationPreferences || {};
    return res.json({
      preferences: {
        passwordReset: preferences.passwordReset !== false,
        support: preferences.support !== false,
        reports: preferences.reports !== false,
        bans: preferences.bans !== false,
        staffActions: preferences.staffActions !== false
      }
    });
  } catch (error) {
    console.error('Staff notification preferences retrieval failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les préférences de notification.' });
  }
});

router.patch('/notifications/preferences', requireStaffRole('support'), async (req, res) => {
  try {
    const preferences = req.body?.preferences;
    const keys = ['passwordReset', 'support', 'reports', 'bans', 'staffActions'];
    if (!preferences || keys.some(key => typeof preferences[key] !== 'boolean')) {
      return res.status(400).json({ error: 'Toutes les préférences de notification doivent être définies.' });
    }
    const update = {};
    for (const key of keys) update['staffNotificationPreferences.' + key] = preferences[key];
    await User.updateOne({ _id: req.user.id }, { $set: update });
    await audit(req, 'staff.notifications.updated', { details: { preferences } });
    return res.json({ success: true, preferences });
  } catch (error) {
    console.error('Staff notification preferences update failed:', error);
    return res.status(500).json({ error: 'Impossible d’enregistrer les préférences de notification.' });
  }
});

router.get('/notifications/events', requireStaffRole('support'), async (req, res) => {
  try {
    const eventActions = [
      'user.banned', 'user.unbanned', 'staff.role.updated',
      'report.status.updated', 'report.deleted',
      'account_help.reply_updated', 'account_help.status_updated',
      'account_help.request_deleted', 'account_help.recovery_code_issued',
      'user.password_reset.issued', 'user.password_reset.completed',
      'staff.bootstrap.completed'
    ];
    const logs = await StaffAuditLog.find({ action: { $in: eventActions } })
      .sort({ createdAt: -1 })
      .limit(60)
      .select('actor actorUsername action targetUser targetUsername targetReport createdAt')
      .lean();

    const ids = [...new Set(logs.flatMap(log => [
      log.actor ? log.actor.toString() : null,
      log.targetUser ? log.targetUser.toString() : null
    ]).filter(Boolean))];
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }).select('_id username').lean()
      : [];
    const usernames = new Map(users.map(user => [user._id.toString(), user.username]));
    const events = logs.map(log => ({
      _id: log._id.toString(),
      action: log.action,
      actorUsername: log.actorUsername || (log.actor ? usernames.get(log.actor.toString()) : null) || 'Personnel',
      targetUsername: log.targetUsername || (log.targetUser ? usernames.get(log.targetUser.toString()) : null) || null,
      createdAt: log.createdAt
    }));

    let reports = [];
    if (roleLevel(req.user.staffRole) >= roleLevel('junior_moderator')) {
      reports = await Report.find({ status: 'new' })
        .sort({ createdAt: -1 })
        .limit(40)
        .select('_id reportScope reason status createdAt')
        .lean();
      reports = reports.map(report => ({
        _id: report._id.toString(),
        reportScope: report.reportScope,
        reason: report.reason || '',
        status: report.status,
        createdAt: report.createdAt
      }));
    }

    return res.json({ events, reports });
  } catch (error) {
    console.error('Staff notification events retrieval failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les notifications du personnel.' });
  }
});

router.get('/account-help/requests', requireStaffRole('support'), async (req, res) => {
  try {
    const requests = await SupportRequest.find({})
      .sort({ status: 1, createdAt: -1 })
      .limit(200)
      .populate('userId', 'username displayName')
      .lean();
    const normalizedRequests = requests.map(item => {
      const messages = Array.isArray(item.messages) ? [...item.messages] : [];
      if (!messages.some(message => message.senderType === 'user') && item.message) {
        messages.unshift({
          senderType: 'user',
          senderName: item.username,
          text: item.message,
          createdAt: item.createdAt
        });
      }
      if (item.staffReply && !messages.some(message => message.senderType === 'staff' && message.text === item.staffReply)) {
        messages.push({
          senderType: 'staff',
          senderName: 'Personnel Propard',
          text: item.staffReply,
          createdAt: item.staffReplyAt || item.updatedAt || item.createdAt
        });
      }
      return { ...item, messages };
    });
    const staffUser = await User.findById(req.user.id).select('staffNotificationPreferences').lean();
    const preferences = staffUser?.staffNotificationPreferences || {};
    return res.json({
      requests: normalizedRequests,
      notifications: {
        passwordReset: preferences.passwordReset !== false,
        support: preferences.support !== false
      }
    });
  } catch (error) {
    console.error('Account help requests retrieval failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les demandes.' });
  }
});

router.delete('/account-help/requests/:id', requireStaffRole('senior_moderator'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Demande invalide.' });
    }

    const supportRequest = await SupportRequest.findById(req.params.id);
    if (!supportRequest) return res.status(404).json({ error: 'Demande introuvable.' });
    if (supportRequest.status !== 'resolved') {
      return res.status(409).json({ error: 'Seules les demandes résolues peuvent être supprimées.' });
    }

    await audit(req, 'account_help.request_deleted', {
      targetUser: supportRequest.userId || null,
      details: {
        requestId: supportRequest._id.toString(),
        kind: supportRequest.kind,
        status: supportRequest.status,
        createdAt: supportRequest.createdAt,
        updatedAt: supportRequest.updatedAt
      }
    });
    await SupportRequest.deleteOne({ _id: supportRequest._id });

    return res.json({ success: true, message: 'Demande supprimée manuellement.' });
  } catch (error) {
    console.error('Account-help request deletion failed:', error);
    return res.status(500).json({ error: 'Impossible de supprimer la demande.' });
  }
});

router.patch('/account-help/requests/:id', requireStaffRole('support'), async (req, res) => {
  try {
    const body = req.body || {};
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasReply = Object.prototype.hasOwnProperty.call(body, 'staffReply');
    if (!mongoose.isValidObjectId(req.params.id) ||
        (hasStatus && !['new', 'in_progress', 'resolved'].includes(body.status)) ||
        (hasReply && (typeof body.staffReply !== 'string' || body.staffReply.trim().length > 1500)) ||
        (!hasStatus && !hasReply)) {
      return res.status(400).json({ error: 'Demande, statut ou réponse invalide.' });
    }
    const supportRequest = await SupportRequest.findById(req.params.id);
    if (!supportRequest) return res.status(404).json({ error: 'Demande introuvable.' });

    if (hasStatus) supportRequest.status = body.status;
    if (hasReply) {
      supportRequest.staffReply = body.staffReply.trim();
      supportRequest.staffReplyAt = new Date();
      if (body.staffReply.trim()) {
        const staffUser = await User.findById(req.user.id).select('username').lean();
        supportRequest.messages.push({
          senderType: 'staff',
          senderName: staffUser?.username || 'Support Propard',
          text: body.staffReply.trim(),
          createdAt: new Date()
        });
      }
    }
    supportRequest.updatedAt = new Date();
    supportRequest.handledBy = req.user.id;
    await supportRequest.save();

    const populatedRequests = await SupportRequest.find({ _id: supportRequest._id })
      .populate('userId', 'username displayName')
      .populate('handledBy', 'username displayName')
      .lean();
    const updatedRequest = populatedRequests[0] || supportRequest.toObject();

    await audit(req, hasReply ? 'account_help.reply_updated' : 'account_help.status_updated', {
      targetUser: updatedRequest.userId?._id || supportRequest.userId || null,
      details: { requestId: supportRequest._id.toString(), status: supportRequest.status, replyUpdated: hasReply }
    });
    return res.json({ success: true, request: updatedRequest });
  } catch (error) {
    console.error('Account help request update failed:', error);
    return res.status(500).json({ error: 'Impossible de modifier la demande.' });
  }
});

router.post('/account-help/requests/:id/recovery-code', requireStaffRole('support'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Demande invalide.' });
    }
    const supportRequest = await SupportRequest.findById(req.params.id);
    if (!supportRequest || supportRequest.kind !== 'password_reset') {
      return res.status(404).json({ error: 'Demande de récupération introuvable.' });
    }
    if (!supportRequest.userId) {
      return res.status(409).json({ error: 'Le compte associé n’a pas été trouvé. Recherche le pseudo exact puis vérifie la demande avant de continuer.' });
    }
    const target = await findTargetUser(supportRequest.userId.toString());
    if (!target) return res.status(404).json({ error: 'Compte Propard introuvable.' });
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole)) {
      return res.status(403).json({ error: 'Tu ne peux pas lancer la récupération de ce compte du personnel.' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: 'Le service de récupération n’est pas configuré côté serveur.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    target.passwordResetTokenHash = hashToken(token);
    target.passwordResetExpiresAt = expiresAt;
    target.passwordResetIssuedBy = req.user.id;
    await target.save();

    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const key = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    supportRequest.recoveryCodeEncrypted = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    supportRequest.recoveryCodeExpiresAt = expiresAt;
    supportRequest.status = 'in_progress';
    supportRequest.updatedAt = new Date();
    supportRequest.handledBy = req.user.id;
    supportRequest.staffReply = 'Ta demande a été acceptée. Un code de récupération temporaire est disponible dans le suivi de ta demande. Il expire dans 15 minutes.';
    supportRequest.staffReplyAt = new Date();
    await supportRequest.save();

    await audit(req, 'account_help.recovery_code_issued', {
      targetUser: target._id,
      details: { requestId: supportRequest._id.toString(), expiresAt }
    });
    return res.json({ success: true, expiresAt, message: 'Code créé. Le demandeur peut le consulter depuis le suivi sécurisé de sa demande.' });
  } catch (error) {
    console.error('Account-help recovery code creation failed:', error);
    return res.status(500).json({ error: 'Impossible de créer le code de récupération.' });
  }
});

router.get('/account-help/settings', requireStaffRole('support'), async (req, res) => {
  try {
    const staffUser = await User.findById(req.user.id).select('staffNotificationPreferences').lean();
    const preferences = staffUser?.staffNotificationPreferences || {};
    return res.json({
      passwordResetNotifications: preferences.passwordReset !== false,
      supportNotifications: preferences.support !== false
    });
  } catch (error) {
    console.error('Account help settings retrieval failed:', error);
    return res.status(500).json({ error: 'Impossible de charger les préférences.' });
  }
});

router.patch('/account-help/settings', requireStaffRole('support'), async (req, res) => {
  try {
    const { passwordResetNotifications, supportNotifications } = req.body || {};
    if (typeof passwordResetNotifications !== 'boolean' || typeof supportNotifications !== 'boolean') {
      return res.status(400).json({ error: 'Préférences de notification invalides.' });
    }
    const staffUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: {
        'staffNotificationPreferences.passwordReset': passwordResetNotifications,
        'staffNotificationPreferences.support': supportNotifications
      }},
      { new: true, runValidators: true }
    ).select('staffNotificationPreferences');
    if (!staffUser) return res.status(404).json({ error: 'Compte du personnel introuvable.' });
    await audit(req, 'account_help.notifications_updated', {
      details: { passwordResetNotifications, supportNotifications }
    });
    return res.json({
      passwordResetNotifications: staffUser.staffNotificationPreferences.passwordReset,
      supportNotifications: staffUser.staffNotificationPreferences.support
    });
  } catch (error) {
    console.error('Account help settings update failed:', error);
    return res.status(500).json({ error: 'Impossible d’enregistrer les préférences.' });
  }
});

router.get('/bootstrap/status', async (req, res) => {
  try {
    const staffRoles = Object.keys(ROLE_LEVELS).filter(role => role !== 'user');
    const existingStaff = await User.countDocuments({
      staffRole: { $in: staffRoles }
    });
    return res.json({ available: existingStaff === 0 });
  } catch (error) {
    console.error('Staff bootstrap status check failed:', error);
    return res.status(500).json({ error: 'Impossible de vérifier la configuration du personnel.' });
  }
});

router.post('/bootstrap', async (req, res) => {
  try {
    const expectedSecret = process.env.STAFF_BOOTSTRAP_KEY || process.env.ADMIN_KEY;
    if (!safeEqual(req.body && req.body.bootstrapKey, expectedSecret)) {
      return res.status(403).json({ error: 'Clé de configuration invalide.' });
    }

    const existingStaff = await User.countDocuments({
      staffRole: { $in: Object.keys(ROLE_LEVELS).filter(role => role !== 'user') }
    });
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
  return res.json({
    staffRole: req.user.staffRole,
    permissions: Object.keys(ROLE_LEVELS).filter(role => roleLevel(role) <= roleLevel(req.user.staffRole))
  });
});

router.get('/reports', requireStaffRole('junior_moderator'), async (req, res) => {
  try {
    const status = ['new', 'processed', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const reports = await Report.find(status ? { status } : {})
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

router.delete('/reports/:reportId', requireStaffRole('senior_moderator'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reportId)) {
      return res.status(400).json({ error: 'Signalement invalide.' });
    }

    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Signalement introuvable.' });
    if (!['processed', 'rejected'].includes(report.status)) {
      return res.status(409).json({ error: 'Seuls les signalements déjà traités ou rejetés peuvent être supprimés.' });
    }

    await audit(req, 'report.deleted', {
      targetReport: report._id,
      details: {
        status: report.status,
        reportScope: report.reportScope,
        createdAt: report.createdAt,
        processedAt: report.processedAt
      }
    });
    await Report.deleteOne({ _id: report._id });

    return res.json({ success: true, message: 'Signalement supprimé.' });
  } catch (error) {
    console.error('Staff report deletion failed:', error);
    return res.status(500).json({ error: 'Impossible de supprimer le signalement.' });
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

    await audit(req, report.reportScope === 'conversation' ? 'report.conversation.viewed' : 'report.message.viewed', {
      targetReport: report._id
    });

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

    const status = req.body && req.body.status;
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

router.get('/users/search', requireStaffRole('support'), async (req, res) => {
  try {
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Indique un pseudo de 3 à 20 caractères.' });
    }

    const target = await User.findOne({
      username: { $regex: new RegExp('^' + escapeRegex(username) + '$', 'i') }
    }).select('_id username displayName staffRole bannedAt banExpiresAt banReason');

    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    await audit(req, 'staff.user.lookup', {
      targetUser: target._id,
      details: { username: target.username }
    });

    return res.json({ user: target });
  } catch (error) {
    console.error('Staff user lookup failed:', error);
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

    const body = req.body || {};
    const duration = body.duration;
    const reason = body.reason;
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
        if (socket.userId && socket.userId.toString() === target._id.toString()) {
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
    target.passwordResetIssuedBy = req.user.id;
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

    const staffRole = req.body && req.body.staffRole;
    if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, staffRole)) {
      return res.status(400).json({ error: 'Rôle du personnel invalide.' });
    }

    const canAssignRole = canManageRole(req.user.staffRole, staffRole);
    if (!actorCanManageTarget(req.user.staffRole, target.staffRole) || !canAssignRole) {
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
    const rawLogs = await StaffAuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('targetReport', 'status reportScope createdAt')
      .lean();

    const userIds = [...new Set(rawLogs.flatMap(log => [
      log.actor ? log.actor.toString() : null,
      log.targetUser ? log.targetUser.toString() : null
    ]).filter(id => id && mongoose.isValidObjectId(id)))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('username displayName staffRole').lean()
      : [];
    const usersById = new Map(users.map(user => [user._id.toString(), user]));

    const logs = rawLogs.map(log => {
      const actorId = log.actor ? log.actor.toString() : null;
      const targetUserId = log.targetUser ? log.targetUser.toString() : null;
      const actor = actorId ? usersById.get(actorId) || null : null;
      const targetUser = targetUserId ? usersById.get(targetUserId) || null : null;
      return {
        ...log,
        actor,
        targetUser,
        actorId,
        targetUserId,
        actorUsername: log.actorUsername || actor?.username || null,
        targetUsername: log.targetUsername || targetUser?.username || log.details?.username || null
      };
    });
    return res.json({ logs });
  } catch (error) {
    console.error('Staff audit log retrieval failed:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});


router.post('/audit/:logId/undo', requireStaffRole('owner'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.logId)) {
      return res.status(400).json({ error: 'Action invalide.' });
    }

    const original = await StaffAuditLog.findById(req.params.logId);
    if (!original) return res.status(404).json({ error: 'Action introuvable.' });

    if (original.action === 'audit.action.undone') {
      return res.status(409).json({ error: 'Une annulation ne peut pas être annulée depuis cette entrée.' });
    }

    const alreadyUndone = await StaffAuditLog.exists({
      action: 'audit.action.undone',
      'details.originalLogId': original._id.toString()
    });
    if (alreadyUndone) return res.status(409).json({ error: 'Cette action a déjà été annulée.' });

    const details = original.details || {};
    let undoDescription;

    if (original.action === 'user.banned' && original.targetUser) {
      const target = await User.findById(original.targetUser);
      if (!target) return res.status(404).json({ error: 'Le compte concerné n’existe plus.' });
      if (!target.bannedAt) return res.status(409).json({ error: 'Ce compte n’est actuellement plus banni. Rien n’a été modifié.', code: 'BAN_ALREADY_INACTIVE', targetUsername: target.username });
      target.bannedAt = null;
      target.banExpiresAt = null;
      target.banReason = null;
      target.sessionVersion = (target.sessionVersion || 0) + 1;
      await target.save();
      const io = req.app.get('io');
      if (io) {
        for (const socket of io.sockets.sockets.values()) {
          if (socket.userId && socket.userId.toString() === target._id.toString()) socket.disconnect(true);
        }
      }
      undoDescription = { type: 'unban', targetUserId: target._id.toString(), targetUsername: target.username };
    } else if (original.action === 'staff.role.updated' && original.targetUser &&
      typeof details.previousRole === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVELS, details.previousRole) &&
      typeof details.staffRole === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVELS, details.staffRole)) {
      const target = await User.findById(original.targetUser);
      if (!target) return res.status(404).json({ error: 'Le compte concerné n’existe plus.' });
      if ((target.staffRole || 'user') !== details.staffRole) {
        return res.status(409).json({ error: 'Le rôle a changé depuis cette action. Annulation refusée pour éviter d’écraser une modification plus récente.' });
      }
      target.staffRole = details.previousRole;
      target.staffRoleUpdatedAt = new Date();
      target.staffRoleUpdatedBy = new mongoose.Types.ObjectId(req.user.id);
      await target.save();
      undoDescription = { type: 'role_restore', targetUserId: target._id.toString(), restoredRole: details.previousRole };
    } else if (original.action === 'report.status.updated' && original.targetReport &&
      ['new', 'processed', 'rejected'].includes(details.previousStatus) &&
      ['new', 'processed', 'rejected'].includes(details.status)) {
      const report = await Report.findById(original.targetReport);
      if (!report) return res.status(404).json({ error: 'Le signalement concerné n’existe plus.' });
      if (report.status !== details.status) {
        return res.status(409).json({ error: 'Le statut du signalement a changé depuis cette action. Annulation refusée.' });
      }
      report.status = details.previousStatus;
      report.processedAt = details.previousStatus === 'new' ? null : new Date();
      await report.save();
      undoDescription = { type: 'report_status_restore', targetReportId: report._id.toString(), restoredStatus: details.previousStatus };
    } else {
      return res.status(409).json({
        error: 'Cette action n’est pas encore annulable automatiquement. Les suppressions définitives, réinitialisations de mot de passe et actions sans état précédent sauvegardé ne peuvent pas être restaurées en sécurité.'
      });
    }

    await audit(req, 'audit.action.undone', {
      details: {
        originalLogId: original._id.toString(),
        originalAction: original.action,
        originalActor: original.actor ? original.actor.toString() : null,
        undo: undoDescription
      }
    });

    return res.json({ success: true, message: 'Action annulée.', undo: undoDescription });
  } catch (error) {
    console.error('Audit action undo failed:', error);
    return res.status(500).json({ error: 'Erreur serveur pendant l’annulation.', code: 'AUDIT_UNDO_FAILED' });
  }
});

module.exports = router;
