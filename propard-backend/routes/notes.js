const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const ConversationNote = require('../models/ConversationNote');
const User = require('../models/User');
const Group = require('../models/Group');
const { isEncryptedMessagePayload } = require('../utils/inputValidation');

router.use(authMiddleware);

const saveLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyFn: req => 'conversation-note:' + req.user.id,
  message: 'Tu modifies trop souvent les notes. Réessaie plus tard.'
});

const privateKey = (a, b) => [a.toString(), b.toString()].sort().join(':');

async function getPrivateConversation(req, friendId) {
  if (!mongoose.isValidObjectId(friendId)) return null;
  const [current, friend] = await Promise.all([
    User.findById(req.user.id).select('friends blockedUsers'),
    User.findById(friendId).select('blockedUsers')
  ]);
  if (!current || !friend) return null;
  const friends = (current.friends || []).some(item => item.userId?.toString() === friendId.toString());
  const blocked = (current.blockedUsers || []).some(id => id.toString() === friendId.toString()) ||
    (friend.blockedUsers || []).some(id => id.toString() === req.user.id.toString());
  return friends && !blocked ? privateKey(req.user.id, friendId) : null;
}

function emitNoteUpdate(req, scope, key, updatedAt, updatedBy, group = null) {
  const io = req.app.get('io');
  const emitToUser = req.app.get('emitToUser');
  if (!io || typeof emitToUser !== 'function') return;
  const payload = { scope, conversationKey: key, updatedAt, updatedBy: updatedBy.toString() };
  if (scope === 'private') {
    const [first, second] = key.split(':');
    emitToUser(io, first, 'conversationNoteUpdated', payload);
    emitToUser(io, second, 'conversationNoteUpdated', payload);
    return;
  }
  for (const member of group?.members || []) {
    const memberId = (member.userId?._id || member.userId)?.toString();
    if (memberId) emitToUser(io, memberId, 'conversationNoteUpdated', payload);
  }
}

router.get('/private/:friendId', async (req, res) => {
  try {
    const key = await getPrivateConversation(req, req.params.friendId);
    if (!key) return res.status(403).json({ error: 'Conversation privée inaccessible.' });
    const note = await ConversationNote.findOne({ scope: 'private', conversationKey: key }).select('encryptedContent updatedAt updatedBy');
    res.json(note ? {
      encryptedContent: note.encryptedContent,
      updatedAt: note.updatedAt,
      updatedBy: note.updatedBy
    } : null);
  } catch (error) {
    console.error('Private conversation note read failed:', error);
    res.status(500).json({ error: 'Impossible de charger la note partagée.' });
  }
});

router.put('/private/:friendId', saveLimiter, async (req, res) => {
  try {
    const key = await getPrivateConversation(req, req.params.friendId);
    if (!key) return res.status(403).json({ error: 'Conversation privée inaccessible.' });
    const encryptedContent = req.body?.encryptedContent;
    if (!isEncryptedMessagePayload(encryptedContent) || encryptedContent.length > 20000) {
      return res.status(400).json({ error: 'Contenu chiffré invalide.' });
    }
    const now = new Date();
    let note = await ConversationNote.findOne({ scope: 'private', conversationKey: key });
    if (note) {
      note.encryptedContent = encryptedContent;
      note.updatedBy = req.user.id;
      note.updatedAt = now;
      await note.save();
    } else {
      note = await ConversationNote.create({
        scope: 'private',
        conversationKey: key,
        encryptedContent,
        updatedBy: req.user.id,
        updatedAt: now
      });
    }
    emitNoteUpdate(req, 'private', key, note.updatedAt, note.updatedBy);
    res.json({ success: true, updatedAt: note.updatedAt });
  } catch (error) {
    console.error('Private conversation note save failed:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer la note partagée.' });
  }
});

router.get('/group/:groupId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Groupe invalide.' });
    const group = await Group.findOne({ _id: req.params.groupId, 'members.userId': req.user.id }).select('_id');
    if (!group) return res.status(403).json({ error: 'Groupe inaccessible.' });
    const key = group._id.toString();
    const note = await ConversationNote.findOne({ scope: 'group', conversationKey: key }).select('encryptedContent keyVersion updatedAt updatedBy');
    res.json(note ? {
      encryptedContent: note.encryptedContent,
      keyVersion: note.keyVersion,
      updatedAt: note.updatedAt,
      updatedBy: note.updatedBy
    } : null);
  } catch (error) {
    console.error('Group conversation note read failed:', error);
    res.status(500).json({ error: 'Impossible de charger la note partagée.' });
  }
});

router.put('/group/:groupId', saveLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'Groupe invalide.' });
    const group = await Group.findOne({ _id: req.params.groupId, 'members.userId': req.user.id }).select('_id keyVersion members');
    if (!group) return res.status(403).json({ error: 'Groupe inaccessible.' });
    const encryptedContent = req.body?.encryptedContent;
    const keyVersion = req.body?.keyVersion;
    if (!isEncryptedMessagePayload(encryptedContent) || encryptedContent.length > 20000) {
      return res.status(400).json({ error: 'Contenu chiffré invalide.' });
    }
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1 || keyVersion !== (group.keyVersion || 1)) {
      return res.status(409).json({ error: 'La clé du groupe a changé. Recharge la conversation.' });
    }
    const key = group._id.toString();
    const now = new Date();
    let note = await ConversationNote.findOne({ scope: 'group', conversationKey: key });
    if (note) {
      note.encryptedContent = encryptedContent;
      note.keyVersion = keyVersion;
      note.updatedBy = req.user.id;
      note.updatedAt = now;
      await note.save();
    } else {
      note = await ConversationNote.create({
        scope: 'group',
        conversationKey: key,
        encryptedContent,
        keyVersion,
        updatedBy: req.user.id,
        updatedAt: now
      });
    }
    emitNoteUpdate(req, 'group', key, note.updatedAt, note.updatedBy, group);
    res.json({ success: true, updatedAt: note.updatedAt });
  } catch (error) {
    console.error('Group conversation note save failed:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer la note partagée.' });
  }
});

module.exports = router;
