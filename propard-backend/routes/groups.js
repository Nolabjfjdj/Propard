const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const memberOf = (group, userId) =>
  group.members.find(m => m.userId.toString() === userId.toString());

const safeMembers = group => group.members.map(m => ({
  _id: m.userId._id || m.userId,
  username: m.userId.username,
  displayName: m.userId.displayName,
  avatar: m.userId.avatar,
  publicKey: m.userId.publicKey,
  role: m.role,
  joinedAt: m.joinedAt,
  lastReadAt: m.lastReadAt
}));

const validPackages = (packages, memberIds, version) => {
  if (!Array.isArray(packages) || packages.length !== memberIds.length) return false;
  const seen = new Set();
  for (const p of packages) {
    if (!p || !mongoose.isValidObjectId(p.userId) || !mongoose.isValidObjectId(p.senderId)) return false;
    if (p.version !== version || typeof p.encryptedKey !== 'string' || p.encryptedKey.length > 10000) return false;
    if (seen.has(p.userId.toString()) || !memberIds.has(p.userId.toString())) return false;
    seen.add(p.userId.toString());
  }
  return seen.size === memberIds.size;
};

router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ 'members.userId': req.user.id })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .populate('members.userId', 'username displayName avatar publicKey');

    const result = groups.map(g => {
      const me = memberOf(g, req.user.id);
      const obj = g.toObject();
      obj.members = safeMembers(g);
      obj.memberCount = g.members.length;
      obj.unreadCount = me?.lastReadAt && g.lastMessageAt && g.lastMessageAt > me.lastReadAt ? 1 : 0;
      delete obj.keyPackages;
      return obj;
    });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { name, avatar = null, memberIds = [], keyPackages = [] } = req.body;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName || cleanName.length > 50) return res.status(400).json({ error: 'Nom de groupe invalide' });
    if (!Array.isArray(memberIds) || memberIds.length > 49) return res.status(400).json({ error: 'Nombre de membres invalide' });

    const uniqueIds = [...new Set([req.user.id.toString(), ...memberIds.map(String)])];
    if (uniqueIds.some(id => !mongoose.isValidObjectId(id))) return res.status(400).json({ error: 'Membre invalide' });

    const me = await User.findById(req.user.id).select('friends blockedUsers publicKey');
    if (!me || !me.publicKey) return res.status(400).json({ error: 'ClÃ© publique indisponible. Recharge la page puis rÃ©essaie.' });

    const friendIds = new Set(me.friends.map(f => f.userId.toString()));
    for (const id of uniqueIds.slice(1)) {
      if (!friendIds.has(id)) return res.status(403).json({ error: 'Tous les membres doivent Ãªtre tes amis.' });
      if ((me.blockedUsers || []).some(b => b.toString() === id)) return res.status(403).json({ error: 'Membre bloquÃ©.' });
    }

    const memberIdSet = new Set(uniqueIds);
    if (!validPackages(keyPackages, memberIdSet, 1)) return res.status(400).json({ error: 'Paquets de clÃ© invalides.' });
    if (keyPackages.some(p => p.senderId.toString() !== req.user.id.toString())) return res.status(400).json({ error: 'Ãmetteur de clÃ© invalide.' });

    const group = await Group.create({
      name: cleanName,
      avatar: avatar || null,
      owner: req.user.id,
      members: uniqueIds.map((id, i) => ({ userId: id, role: i === 0 ? 'owner' : 'member' })),
      keyVersion: 1,
      keyPackages
    });

    const populated = await Group.findById(group._id).populate('members.userId', 'username displayName avatar publicKey');
    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');
    for (const m of populated.members) {
      emitToUser(io, m.userId._id.toString(), 'groupUpdated', { groupId: group._id.toString() });
    }
    res.status(201).json({ ...populated.toObject(), members: safeMembers(populated), memberCount: populated.members.length, keyPackage: populated.keyPackages.find(p => p.userId.toString() === req.user.id.toString()) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:groupId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'ID invalide' });
    const group = await Group.findById(req.params.groupId).populate('members.userId', 'username displayName avatar publicKey');
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const me = memberOf(group, req.user.id);
    if (!me) return res.status(403).json({ error: 'Tu ne fais pas partie de ce groupe.' });
    const obj = group.toObject();
    obj.members = safeMembers(group);
    obj.memberCount = group.members.length;
    obj.keyPackage = group.keyPackages.find(p => p.userId.toString() === req.user.id.toString()) || null;
    delete obj.keyPackages;
    res.json(obj);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:groupId/messages', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(400).json({ error: 'ID invalide' });
    const group = await Group.findById(req.params.groupId).select('members');
    if (!group || !memberOf(group, req.user.id)) return res.status(403).json({ error: 'AccÃ¨s refusÃ©' });
    const messages = await GroupMessage.find({ group: group._id }).sort({ createdAt: 1 }).limit(100).populate('sender', 'username displayName avatar ipAlias');
    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:groupId/read', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const me = memberOf(group, req.user.id);
    if (!me) return res.status(403).json({ error: 'AccÃ¨s refusÃ©' });
    me.lastReadAt = new Date();
    await group.save();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:groupId', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const me = memberOf(group, req.user.id);
    if (!me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: 'Droits insuffisants' });
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.trim().length > 50) return res.status(400).json({ error: 'Nom invalide' });
      group.name = req.body.name.trim();
    }
    if (req.body.avatar !== undefined) {
      if (req.body.avatar !== null && typeof req.body.avatar !== 'string') return res.status(400).json({ error: 'Avatar invalide' });
      if (typeof req.body.avatar === 'string' && req.body.avatar.length > 1000000) return res.status(400).json({ error: 'Avatar trop volumineux' });
      group.avatar = req.body.avatar || null;
    }
    await group.save();
    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');
    group.members.forEach(m => emitToUser(io, m.userId.toString(), 'groupUpdated', { groupId: group._id.toString() }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:groupId', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (group.owner.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'Seul le propriÃ©taire peut supprimer le groupe.' });
    await GroupMessage.deleteMany({ group: group._id });
    await group.deleteOne();
    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');
    group.members.forEach(m => emitToUser(io, m.userId.toString(), 'groupDeleted', { groupId: group._id.toString() }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:groupId/leave', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate('members.userId', 'publicKey username displayName avatar');
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const me = memberOf(group, req.user.id);
    if (!me) return res.status(400).json({ error: 'Tu ne fais pas partie de ce groupe.' });
    if (group.owner.toString() === req.user.id.toString()) return res.status(400).json({ error: 'Le propriÃ©taire doit supprimer le groupe.' });

    const remaining = group.members.filter(m => m.userId._id.toString() !== req.user.id.toString());
    const remainingIds = new Set(remaining.map(m => m.userId._id.toString()));
    const nextVersion = group.keyVersion + 1;
    if (!validPackages(req.body.keyPackages, remainingIds, nextVersion)) return res.status(400).json({ error: 'Rotation de clÃ© invalide.' });

    group.members = remaining;
    group.keyVersion = nextVersion;
    group.keyPackages = req.body.keyPackages;
    await group.save();
    const io = req.app.get('io');
    const emitToUser = req.app.get('emitToUser');
    remaining.forEach(m => emitToUser(io, m.userId._id.toString(), 'groupUpdated', { groupId: group._id.toString() }));
    emitToUser(io, req.user.id.toString(), 'groupDeleted', { groupId: group._id.toString() });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
