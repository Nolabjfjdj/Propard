const express = require('express');
const mongoose = require('mongoose');
const ScheduledMessage = require('../models/ScheduledMessage');
const User = require('../models/User');
const Group = require('../models/Group');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { isEncryptedMessagePayload } = require('../utils/inputValidation');

const router = express.Router();
router.use(authMiddleware);

const scheduleLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: req => 'scheduled-messages:' + req.user.id,
  message: 'Trop de messages programmés. Réessaie plus tard.'
});

router.get('/', async (req, res) => {
  try {
    const messages = await ScheduledMessage.find({
      sender: req.user.id,
      status: { $in: ['pending', 'processing', 'sent', 'failed'] }
    }).sort({ dueAt: 1 }).limit(100).select('recipient group dueAt status createdAt deliveredMessageId');
    res.json({ messages });
  } catch (error) {
    console.error('Scheduled message list failed:', error);
    res.status(500).json({ error: 'Impossible de charger les messages programmés.' });
  }
});

router.post('/', scheduleLimiter, async (req, res) => {
  try {
    const { recipientId, groupId, content, keyVersion, dueAt } = req.body || {};
    const isPrivate = Boolean(recipientId);
    if (isPrivate === Boolean(groupId)) {
      return res.status(400).json({ error: 'Choisis une conversation privée ou un groupe.' });
    }
    if (!isEncryptedMessagePayload(content)) {
      return res.status(400).json({ error: 'Le contenu doit être chiffré côté client.' });
    }
    const parsedDate = new Date(dueAt);
    const now = Date.now();
    if (!dueAt || !Number.isFinite(parsedDate.getTime()) || parsedDate.getTime() < now + 60 * 1000 || parsedDate.getTime() > now + 30 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Choisis une date située entre 1 minute et 30 jours dans le futur.' });
    }
    const pendingCount = await ScheduledMessage.countDocuments({ sender: req.user.id, status: { $in: ['pending', 'processing'] } });
    if (pendingCount >= 50) return res.status(429).json({ error: 'Tu as déjà 50 messages en attente.' });

    let recipient = null;
    let group = null;
    let safeKeyVersion = null;
    if (isPrivate) {
      if (!mongoose.isValidObjectId(recipientId) || recipientId.toString() === req.user.id.toString()) {
        return res.status(400).json({ error: 'Destinataire invalide.' });
      }
      const [senderAccount, recipientAccount] = await Promise.all([
        User.findById(req.user.id).select('friends blockedUsers'),
        User.findById(recipientId).select('friends blockedUsers')
      ]);
      const senderIsFriend = (senderAccount?.friends || []).some(item => item.userId?.toString() === recipientId.toString());
      const recipientIsFriend = (recipientAccount?.friends || []).some(item => item.userId?.toString() === req.user.id.toString());
      const blocked = (senderAccount?.blockedUsers || []).some(id => id.toString() === recipientId.toString()) ||
        (recipientAccount?.blockedUsers || []).some(id => id.toString() === req.user.id.toString());
      if (!senderIsFriend || !recipientIsFriend || blocked) {
        return res.status(403).json({ error: 'Cette conversation n’est plus accessible.' });
      }
      recipient = recipientId;
    } else {
      if (!mongoose.isValidObjectId(groupId)) return res.status(400).json({ error: 'Groupe invalide.' });
      group = await Group.findOne({ _id: groupId, 'members.userId': req.user.id }).select('_id keyVersion');
      if (!group) return res.status(403).json({ error: 'Tu ne fais pas partie de ce groupe.' });
      if (!Number.isSafeInteger(keyVersion) || keyVersion < 1 || keyVersion !== (group.keyVersion || 1)) {
        return res.status(409).json({ error: 'La clé du groupe a changé. Recharge le groupe avant de programmer ce message.' });
      }
      safeKeyVersion = keyVersion;
    }

    const scheduled = await ScheduledMessage.create({
      sender: req.user.id,
      recipient,
      group: group?._id || null,
      content,
      keyVersion: safeKeyVersion,
      dueAt: parsedDate
    });
    res.status(201).json({
      message: {
        _id: scheduled._id,
        recipient: scheduled.recipient,
        group: scheduled.group,
        dueAt: scheduled.dueAt,
        status: scheduled.status
      }
    });
  } catch (error) {
    console.error('Scheduled message create failed:', error);
    res.status(500).json({ error: 'Impossible de programmer ce message.' });
  }
});

router.delete('/:messageId', scheduleLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.messageId)) return res.status(400).json({ error: 'Message programmé invalide.' });
    const result = await ScheduledMessage.updateOne(
      { _id: req.params.messageId, sender: req.user.id, status: 'pending' },
      { $set: { status: 'cancelled', content: '' } }
    );
    if (!result.modifiedCount) return res.status(404).json({ error: 'Message introuvable, déjà envoyé ou en cours d’envoi.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Scheduled message cancellation failed:', error);
    res.status(500).json({ error: 'Impossible d’annuler ce message.' });
  }
});

module.exports = router;
