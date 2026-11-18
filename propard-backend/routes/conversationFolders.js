const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authMiddleware);

const foldersLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: req => 'conversation-folders:' + req.user.id,
  message: 'Trop de modifications de dossiers. Réessaie plus tard.'
});

function validateFolders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.names) || !value.assignments || typeof value.assignments !== 'object' || Array.isArray(value.assignments)) {
    return false;
  }
  if (value.names.length > 30 || Object.keys(value.assignments).length > 1000) return false;
  const names = value.names.map(name => typeof name === 'string' ? name.trim() : '');
  if (names.some(name => !name || name.length > 24 || /[\u0000-\u001F\u007F]/.test(name))) return false;
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length) return false;
  const allowed = new Set(names);
  for (const [key, folder] of Object.entries(value.assignments)) {
    if (!/^(?:friend|group):[a-f0-9]{24}$/i.test(key) || typeof folder !== 'string' || !allowed.has(folder)) return false;
  }
  return true;
}

router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+conversationFolders');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ folders: user.conversationFolders || null });
  } catch (error) {
    console.error('Conversation folders read failed:', error);
    res.status(500).json({ error: 'Impossible de charger les dossiers.' });
  }
});

router.put('/', foldersLimiter, async (req, res) => {
  try {
    if (!validateFolders(req.body)) return res.status(400).json({ error: 'Dossiers ou affectations invalides.' });
    const user = await User.findById(req.user.id).select('+conversationFolders');
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    user.conversationFolders = {
      names: req.body.names.map(name => name.trim()),
      assignments: req.body.assignments
    };
    await user.save();
    res.json({ success: true, folders: user.conversationFolders });
  } catch (error) {
    console.error('Conversation folders save failed:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer les dossiers.' });
  }
});

module.exports = router;
