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

const buildRecentHistory = (messages, maxMessages = 4, maxCharacters = 3000) => {
  const selected = [];
  let remaining = maxCharacters;

  for (const message of [...(messages || [])].reverse()) {
    if (selected.length >= maxMessages || remaining <= 0) break;
    if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;

    const content = message.content.trim();
    if (!content) continue;

    const keptContent = content.length > remaining
      ? content.slice(-remaining)
      : content;

    selected.push({
      role: message.role,
      content: keptContent
    });
    remaining -= keptContent.length;
  }

  return selected.reverse();
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

    const history = buildRecentHistory(conversation.messages);
    history.push({ role: 'user', content });

    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_my_profile',
          description: 'Consulter le profil non sensible de l’utilisateur connecté.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_my_friends',
          description: 'Lister les amis de l’utilisateur avec leurs identifiants.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_my_groups',
          description: 'Lister les groupes de l’utilisateur.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'prepare_private_message',
          description: 'Préparer un brouillon privé pour un ami. Ne jamais envoyer.',
          parameters: {
            type: 'object',
            properties: {
              friendId: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['friendId', 'content'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'prepare_group_message',
          description: 'Préparer un brouillon dans un groupe. Ne jamais envoyer.',
          parameters: {
            type: 'object',
            properties: {
              groupId: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['groupId', 'content'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'request_last_private_message',
          description: 'Demander au navigateur de déchiffrer localement le dernier message privé.',
          parameters: {
            type: 'object',
            properties: { friendId: { type: 'string' } },
            required: ['friendId'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'request_last_group_message',
          description: 'Demander au navigateur de déchiffrer localement le dernier message du groupe.',
          parameters: {
            type: 'object',
            properties: { groupId: { type: 'string' } },
            required: ['groupId'],
            additionalProperties: false
          }
        }
      }
    ];

    let pendingAction = null;
    let pendingRead = null;

    const executeTool = async (name, args = {}) => {
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
          ? await User.find({ _id: { $in: ids.slice(0, 10) } }).select('username displayName avatar')
          : [];
        return friends.map(friend => ({
          id: friend._id.toString(),
          username: friend.username,
          displayName: friend.displayName || null,
          avatar: friend.avatar || null
        }));
      }

      if (name === 'list_my_groups') {
        const groups = await Group.find({ 'members.userId': req.user.id })
          .select('_id name owner createdAt')
          .sort({ updatedAt: -1 })
          .limit(8)
          .lean();
        return groups.map(group => ({
          id: group._id.toString(),
          name: group.name,
          isOwner: group.owner?.toString() === req.user.id.toString(),
          createdAt: group.createdAt
        }));
      }

      if (name === 'prepare_private_message') {
        if (!mongoose.isValidObjectId(args.friendId) || typeof args.content !== 'string' || !args.content.trim() || args.content.length > 6000) {
          return { error: 'Destinataire ou contenu invalide.' };
        }
        const [friendship, recipient] = await Promise.all([
          User.findById(req.user.id).select('friends'),
          User.findById(args.friendId).select('username displayName')
        ]);
        const isFriend = friendship?.friends?.some(friend => friend.userId?.toString() === args.friendId);
        if (!isFriend || !recipient || args.friendId === req.user.id.toString()) {
          return { error: 'Cet utilisateur n’est pas un ami accessible.' };
        }
        pendingAction = {
          type: 'private_message',
          recipientId: recipient._id.toString(),
          recipientName: recipient.displayName || recipient.username,
          content: args.content.trim()
        };
        return { prepared: true, recipient: pendingAction.recipientName, note: 'Brouillon préparé. Aucune action d’envoi effectuée.' };
      }

      if (name === 'prepare_group_message') {
        if (!mongoose.isValidObjectId(args.groupId) || typeof args.content !== 'string' || !args.content.trim() || args.content.length > 6000) {
          return { error: 'Groupe ou contenu invalide.' };
        }
        const group = await Group.findOne({ _id: args.groupId, 'members.userId': req.user.id }).select('_id name');
        if (!group) return { error: 'Groupe introuvable ou accès refusé.' };
        pendingAction = {
          type: 'group_message',
          groupId: group._id.toString(),
          groupName: group.name,
          content: args.content.trim()
        };
        return { prepared: true, group: group.name, note: 'Brouillon préparé. Aucune action d’envoi effectuée.' };
      }

      if (name === 'request_last_private_message') {
        if (!mongoose.isValidObjectId(args.friendId)) return { error: 'Ami invalide.' };
        const [account, friend] = await Promise.all([
          User.findById(req.user.id).select('friends'),
          User.findById(args.friendId).select('username displayName')
        ]);
        const isFriend = account?.friends?.some(item => item.userId?.toString() === args.friendId);
        if (!isFriend || !friend) return { error: 'Cet utilisateur n’est pas un ami accessible.' };
        pendingRead = {
          type: 'private_message',
          conversationId: friend._id.toString(),
          conversationName: friend.displayName || friend.username
        };
        return { requested: true, note: 'Le navigateur va récupérer le message chiffré et le déchiffrer localement. Ne demande pas son contenu à Groq.' };
      }

      if (name === 'request_last_group_message') {
        if (!mongoose.isValidObjectId(args.groupId)) return { error: 'Groupe invalide.' };
        const group = await Group.findOne({ _id: args.groupId, 'members.userId': req.user.id }).select('_id name');
        if (!group) return { error: 'Groupe introuvable ou accès refusé.' };
        pendingRead = {
          type: 'group_message',
          conversationId: group._id.toString(),
          conversationName: group.name
        };
        return { requested: true, note: 'Le navigateur va récupérer le message chiffré et le déchiffrer localement. Ne demande pas son contenu à Groq.' };
      }

      return { error: 'Outil inconnu.' };
    };

    const requestMessages = [
      {
        role: 'system',
        content: 'Tu es Propard AI. Réponds en français, clairement et honnêtement. Tu peux consulter le profil non sensible, les amis et les groupes de l’utilisateur. Tu peux préparer des brouillons privés ou de groupe, jamais les envoyer : une confirmation explicite dans l’interface est obligatoire. Le contenu des messages E2EE est déchiffré uniquement sur l’appareil et ne doit jamais être transmis à Groq, résumé par toi ou ajouté à l’historique. Ne demande ni mot de passe, ni clé privée, ni clé API, ni code de récupération.'
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
        max_completion_tokens: 700
      });

      const assistantMessage = completion.choices?.[0]?.message;
      const toolCalls = (assistantMessage?.tool_calls || []).slice(0, 5);
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
          const allowedKeys = {
            get_my_profile: [],
            list_my_friends: [],
            list_my_groups: [],
            prepare_private_message: ['friendId', 'content'],
            prepare_group_message: ['groupId', 'content'],
            request_last_private_message: ['friendId'],
            request_last_group_message: ['groupId']
          }[toolName];
          if (!args || typeof args !== 'object' || Array.isArray(args) || !allowedKeys || Object.keys(args).some(key => !allowedKeys.includes(key)) || allowedKeys.some(key => !Object.prototype.hasOwnProperty.call(args, key))) {
            result = { error: 'Arguments invalides.' };
          } else {
            result = await executeTool(toolName, args);
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
      ...(pendingAction ? { pendingAction } : {}),
      ...(pendingRead ? { pendingRead } : {}),
      conversation: {
        id: conversation._id.toString(),
        title: conversation.title,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    const status = error.code === 'GROQ_NOT_CONFIGURED'
      ? 503
      : error.status === 413
        ? 413
        : error.status === 429
          ? 429
          : error.status >= 500
            ? 503
            : 500;
    console.error('Propard AI message failed:', {
      code: error.code || 'UNKNOWN',
      status: error.status || null,
      groqType: error.groqType || null,
      groqCode: error.groqCode || null,
      groqParam: error.groqParam || null
    });
    res.status(status).json({
      error: status === 413
        ? 'La demande dépasse la limite de tokens autorisée par Groq. L’historique a été réduit ; essaie dans une nouvelle conversation ou avec un message plus court.'
        : status === 429
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
