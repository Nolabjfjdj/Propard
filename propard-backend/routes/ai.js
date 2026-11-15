const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const AIConversation = require('../models/AIConversation');
const User = require('../models/User');
const Group = require('../models/Group');
const { createGroqCompletion, getGroqConfiguration } = require('../services/groq');

router.use(authMiddleware);

const messageLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyFn: req => `propard-ai:${req.user.id}`,
  message: 'Tu envoies trop de messages à Propard AI. Réessaie dans quelques minutes.'
});

const titleFromMessage = value => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
};

const serializeConversation = conversation => ({
  id: conversation._id.toString(),
  title: conversation.title,
  messages: (conversation.messages || []).map(message => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  })),
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt
});

router.get('/status', (req, res) => {
  const config = getGroqConfiguration();
  res.json({ available: config.configured, model: config.model, keyCount: config.keyCount });
});

router.get('/conversations', async (req, res) => {
  try {
    const conversations = await AIConversation.find({ userId: req.user.id })
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json(conversations.map(item => ({
      id: item._id.toString(),
      title: item.title,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })));
  } catch (error) {
    console.error('Propard AI conversation list failed:', error.message);
    res.status(500).json({ error: 'Impossible de charger les conversations.' });
  }
});

router.post('/conversations', async (req, res) => {
  try {
    const conversation = await AIConversation.create({
      userId: req.user.id,
      title: 'Nouvelle conversation',
      messages: []
    });
    res.status(201).json(serializeConversation(conversation));
  } catch (error) {
    console.error('Propard AI conversation creation failed:', error.message);
    res.status(500).json({ error: 'Impossible de créer une conversation.' });
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Conversation invalide.' });
    }
    const conversation = await AIConversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable.' });
    res.json(serializeConversation(conversation));
  } catch (error) {
    console.error('Propard AI conversation read failed:', error.message);
    res.status(500).json({ error: 'Impossible de charger cette conversation.' });
  }
});

router.post('/conversations/:id/messages', messageLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Conversation invalide.' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 6000) {
      return res.status(400).json({ error: 'Le message doit contenir entre 1 et 6000 caractères.' });
    }

    const conversation = await AIConversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable.' });

    const config = getGroqConfiguration();
    if (!config.configured) {
      return res.status(503).json({ error: 'Propard AI n’est pas configuré. Les clés Groq sont absentes du serveur.' });
    }

    const history = (conversation.messages || []).slice(-20).map(message => ({
      role: message.role,
      content: message.content
    }));
    history.push({ role: 'user', content });

    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_my_profile',
          description: 'Consulter les informations non sensibles du profil Propard de l’utilisateur connecté.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_my_friends',
          description: 'Lister les amis Propard de l’utilisateur connecté.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_my_groups',
          description: 'Lister les groupes Propard dont l’utilisateur connecté est membre.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      }
    ];

    const executeTool = async name => {
      if (name === 'get_my_profile') {
        const profile = await User.findById(req.user.id).select('username displayName avatar staffRole createdAt');
        if (!profile) return { error: 'Profil introuvable.' };
        return {
          username: profile.username,
          displayName: profile.displayName || null,
          avatar: profile.avatar || null,
          staffRole: profile.staffRole,
          createdAt: profile.createdAt
        };
      }

      if (name === 'list_my_friends') {
        const account = await User.findById(req.user.id).select('friends');
        if (!account) return { error: 'Compte introuvable.' };
        const ids = (account.friends || []).map(friend => friend.userId).filter(Boolean);
        const friends = ids.length
          ? await User.find({ _id: { $in: ids } }).select('username displayName avatar')
          : [];
        return friends.map(friend => ({
          username: friend.username,
          displayName: friend.displayName || null,
          avatar: friend.avatar || null
        }));
      }

      if (name === 'list_my_groups') {
        const groups = await Group.find({ 'members.userId': req.user.id })
          .select('_id name owner createdAt')
          .sort({ updatedAt: -1 })
          .limit(30)
          .lean();
        return groups.map(group => ({
          id: group._id.toString(),
          name: group.name,
          isOwner: group.owner?.toString() === req.user.id.toString(),
          createdAt: group.createdAt
        }));
      }

      return { error: 'Outil inconnu.' };
    };

    const requestMessages = [
      {
        role: 'system',
        content: 'Tu es Propard AI, l’assistant intégré à Propard. Réponds en français par défaut, clairement et honnêtement. Tu peux aider sur les sujets généraux et utiliser uniquement les outils de consultation explicitement disponibles pour lire le profil non sensible, les amis et les groupes de l’utilisateur connecté. Les outils sont limités à son propre compte. Tu ne peux pas lire les messages privés, les conversations E2EE, les fichiers, les clés, les mots de passe ni les données d’autres utilisateurs. Tu ne peux modifier aucun paramètre ni effectuer d’action destructive. Ne prétends jamais avoir effectué une action qui n’a pas été exécutée. Ne demande jamais de mot de passe, de clé privée, de clé API ou de code de récupération.'
      },
      ...history
    ];

    let completion;
    for (let round = 0; round < 4; round++) {
      completion = await createGroqCompletion({
        messages: requestMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.6,
        max_completion_tokens: 1400
      });

      const assistantMessage = completion.choices?.[0]?.message;
      const toolCalls = assistantMessage?.tool_calls || [];
      if (!toolCalls.length) break;

      requestMessages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: toolCalls
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        let result;
        try {
          const args = JSON.parse(toolCall.function?.arguments || '{}');
          if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) {
            result = { error: 'Arguments invalides.' };
          } else {
            result = await executeTool(toolName);
          }
        } catch {
          result = { error: 'Impossible d’exécuter cet outil.' };
        }
        requestMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    const answer = completion?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return res.status(502).json({ error: 'Groq a renvoyé une réponse vide. Réessaie.' });
    }

    const now = new Date();
    conversation.messages.push(
      { role: 'user', content, createdAt: now },
      { role: 'assistant', content: answer.trim(), createdAt: new Date() }
    );
    if (conversation.messages.length > 80) {
      conversation.messages = conversation.messages.slice(-80);
    }
    if (conversation.messages.length === 2 && conversation.title === 'Nouvelle conversation') {
      conversation.title = titleFromMessage(content);
    }
    conversation.updatedAt = new Date();
    await conversation.save();

    res.json({
      userMessage: { role: 'user', content, createdAt: now },
      assistantMessage: { role: 'assistant', content: answer.trim(), createdAt: new Date() },
      conversation: {
        id: conversation._id.toString(),
        title: conversation.title,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    const status = error.code === 'GROQ_NOT_CONFIGURED'
      ? 503
      : error.status === 429
        ? 429
        : error.status >= 500
          ? 503
          : 500;
    console.error('Propard AI message failed:', {
      code: error.code || 'UNKNOWN',
      status: error.status || null
    });
    res.status(status).json({
      error: status === 429
        ? 'Limite Groq temporairement atteinte. Réessaie dans un instant.'
        : status === 503
          ? 'Le service IA est temporairement indisponible. Réessaie plus tard.'
          : 'Impossible de générer une réponse.'
    });
  }
});

router.patch('/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Conversation invalide.' });
    }
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
    if (!title) return res.status(400).json({ error: 'Le titre est obligatoire.' });
    const conversation = await AIConversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { title, updatedAt: new Date() } },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable.' });
    res.json({ id: conversation._id.toString(), title: conversation.title });
  } catch (error) {
    console.error('Propard AI conversation rename failed:', error.message);
    res.status(500).json({ error: 'Impossible de renommer cette conversation.' });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Conversation invalide.' });
    }
    const conversation = await AIConversation.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).select('_id');
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable.' });
    await AIConversation.findByIdAndDelete(conversation._id);
    res.json({ success: true });
  } catch (error) {
    console.error('Propard AI conversation deletion failed:', error.message);
    res.status(500).json({ error: 'Impossible de supprimer cette conversation.' });
  }
});

module.exports = router;
