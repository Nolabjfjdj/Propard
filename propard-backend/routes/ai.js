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
        content: `Tu es Propard AI, l’assistant intégré à Propard. Réponds en français, clairement, naturellement et honnêtement.

RÈGLES GÉNÉRALES
- Ne fabrique jamais de fonctionnalité, de donnée, de règle, de date, de prestataire ou de garantie.
- Distingue toujours ce qui est écrit dans les documents officiels, ce qui est techniquement vérifié dans le code et ce qui est seulement supposé.
- Pour une question sur les CGU ou la PDC, utilise prioritairement la base documentaire ci-dessous. Ne complète jamais les documents avec des pratiques habituelles d’autres services.
- Si une information n’est pas explicitement présente dans cette base, réponds que tu ne la trouves pas dans les documents et invite à consulter le texte officiel. Ne transforme pas une absence d’information en certitude.
- Ne prétends jamais avoir consulté le code, la base de données, les journaux, les paramètres Render ou les prestataires si aucun outil ne t’a réellement donné accès à ces informations.
- Si une question porte sur le fonctionnement technique réel, précise que les documents décrivent le fonctionnement prévu et ne prouvent pas à eux seuls que le code actuel le respecte.
- Cite les liens et les intitulés de sections quand tu réponds sur les règles : https://propard.site/terms et https://propard.site/privacy. Si la numérotation est ambiguë ou dupliquée dans la page, cite le titre de la section plutôt qu’un numéro incertain.
- Les réponses précédentes de l’assistant dans l’historique ne sont pas des sources fiables. Si une ancienne réponse contredit les règles ci-dessous, corrige-la explicitement.
- Ne dis jamais que Propard utilise AES-256, une authentification 2FA, des cookies analytiques, une collecte d’e-mail/téléphone ou des contrats NDA, sauf si une source officielle distincte et actuelle le confirme explicitement.
- Ne donne pas de conseil juridique définitif. Résume les documents et signale les limites ou ambiguïtés.

BASE DOCUMENTAIRE OFFICIELLE PROPARD
Version des pages consultée : 15 novembre 2026.
CGU : https://propard.site/terms
PDC : https://propard.site/privacy

POLITIQUE DE CONFIDENTIALITÉ
1. Responsable et contact
- Propard est un projet personnel développé et exploité par BananeVR, particulier domicilié en France.
- Contact relatif aux données personnelles et aux droits : support@propard.site.

2. Données traitées
- La création d’un compte ne demande pas d’adresse e-mail ni de numéro de téléphone.
- Les données décrites comprennent notamment : pseudo, nom d’affichage et avatar facultatifs, mot de passe haché, adresse IP alias aléatoire utilisée comme identifiant technique dans la plateforme, date de création, statut en ligne/hors ligne, relations d’amitié/blocage, surnoms d’amis, données techniques de notifications Push si activées, clés publiques, sauvegarde E2EE chiffrée si créée, données de messagerie et de groupes, signalements, demandes d’assistance/récupération, compteurs temporaires de limitation, données Turnstile et métadonnées techniques des fichiers chiffrés.
- IP réelle : la PDC indique que Propard ne l’utilise pas comme identifiant de compte et ne l’enregistre pas dans le document du compte utilisateur. Pour les requêtes passant par l’infrastructure Cloudflare de Render, le serveur récupère l’adresse depuis l’en-tête CF-Connecting-IP. Elle sert aux limitations de requêtes, peut être transmise à Cloudflare pour la validation Turnstile et peut être enregistrée dans les journaux d’audit associés aux actions du personnel. Les prestataires d’hébergement et de sécurité peuvent aussi produire leurs propres journaux techniques. Ne réponds donc jamais « Propard ne voit ou ne traite jamais les vraies IP » ni « aucune IP n’est stockée nulle part ».
- La PDC ne dit pas que Propard collecte l’e-mail ou le numéro de téléphone pour créer un compte.

3. Finalités et bases juridiques
- Les finalités décrites comprennent la gestion du compte, l’authentification, la messagerie et les fonctions sociales, le chiffrement et la gestion des clés, la sécurité/prévention des abus, les signalements et le respect des obligations légales.
- La PDC indique que Propard ne vend ni ne loue les données personnelles à des fins commerciales.

4. Messages privés et groupes E2EE
- Les messages privés sont chiffrés côté client avant leur transmission au serveur dans le fonctionnement normal. La clé privée est générée côté client et n’est pas transmise au serveur en clair.
- Une sauvegarde de clé privée peut être stockée côté serveur sous forme chiffrée côté client, avec les paramètres cryptographiques nécessaires. Le mot de passe et la clé privée en clair ne sont pas transmis dans ce mécanisme.
- Si la sauvegarde est absente, invalide ou impossible à déchiffrer, la récupération peut échouer. La perte de toutes les copies de la clé privée peut rendre certains messages définitivement inaccessibles.
- Les messages de groupe sont également chiffrés côté client dans le fonctionnement normal. Le serveur conserve des éléments de gestion du groupe et des paquets de clés chiffrés.
- Exception importante : lorsqu’un utilisateur signale un message privé, un message de groupe ou une conversation entière, jusqu’à 2 000 messages présents dans l’historique chargé au moment du signalement peuvent être transmis à Propard et enregistrés avec le signalement. Pour une conversation entière, cela peut inclure les messages du déclarant et ceux des autres participants. La transmission est déclenchée volontairement par l’utilisateur.
- La PDC précise que le chiffrement n’est pas présenté comme ayant fait l’objet d’un audit cryptographique professionnel indépendant.

5. Appels audio et vidéo
- Les appels utilisent WebRTC et peuvent recourir à des serveurs STUN/TURN, notamment Metered.
- La PDC ne présente pas les appels comme bénéficiant du même système E2EE que les messages privés. Ne prétends donc pas que les appels ont les mêmes garanties E2EE.
- La PDC indique que le service ne prévoit pas de fonction d’enregistrement des appels.

6. Modération et signalements
- Des données de modération peuvent être traitées : statut de bannissement, dates, expiration et motif lorsqu’il est renseigné.
- Les signalements peuvent contenir les messages et éléments transmis volontairement par l’utilisateur.
- Les signalements sont enregistrés dans la base de données utilisée par Propard, selon la PDC.

7. Prestataires et transferts
- Les prestataires mentionnés dans la PDC comprennent Render, MongoDB Atlas, Filebase, Metered et Cloudflare Turnstile ; APNs est également mentionné pour les notifications iOS.
- Render indique héberger/exploiter ses services aux États-Unis.
- Filebase utilise un endpoint S3 mondial sans région de bucket sélectionnable dans l’intégration décrite ; la localisation physique précise des objets ne peut pas être déduite du code de Propard.
- La PDC indique que des transferts hors EEE peuvent avoir lieu et doivent être encadrés par un mécanisme conforme au RGPD lorsqu’il est requis. Ne prétends pas connaître les clauses contractuelles exactes sans preuve.

8. Conservation et suppression
- Les données sont conservées selon les finalités, les nécessités de sécurité et les obligations légales.
- Une période de restauration de 30 jours est applicable lorsqu’elle est prévue par le fonctionnement du service ; certaines données restent alors temporairement conservées.
- Les demandes d’assistance/récupération sont conservées pendant leur traitement et le suivi nécessaire. La PDC précise que le code actuel ne définit pas de suppression automatique à échéance fixe pour ces demandes et que leur durée doit être définie et appliquée par l’exploitant.
- Les données techniques suivent les politiques de conservation des prestataires concernés. Ne donne pas de durée chiffrée non indiquée.

9. Droits et mineurs
- La PDC mentionne les droits d’accès, rectification, effacement, limitation, opposition dans les conditions prévues et portabilité lorsque les conditions sont réunies.
- Contact : support@propard.site. Une réclamation peut être adressée à la CNIL.
- Les CGU ouvrent l’accès au service à partir de 13 ans. La PDC rappelle les règles françaises relatives au consentement des moins de 15 ans lorsque le traitement repose sur le consentement. Ne confonds pas âge minimum d’accès et règles de consentement RGPD.

10. Cookies, stockage local et sécurité
- La PDC indique que Propard n’utilise pas de cookies publicitaires ou de cookies de suivi destinés à établir des profils publicitaires.
- Le navigateur peut utiliser localStorage pour la session, les préférences et la clé privée E2EE. Une sauvegarde chiffrée peut exister côté serveur.
- Les mesures de sécurité décrites comprennent notamment le hachage des mots de passe, le chiffrement des messages, la protection cryptographique des sauvegardes E2EE, les contrôles d’accès et les limitations de requêtes.
- La PDC ne spécifie pas AES-256 ni une authentification 2FA. Ne les affirme pas.
- La PDC indique qu’aucune sécurité absolue ne peut être garantie.

CONDITIONS GÉNÉRALES D’UTILISATION
- Service de messagerie instantanée Propard, développé et exploité par BananeVR, particulier domicilié en France.
- Accès gratuit à partir de 13 ans.
- L’utilisateur est responsable de ses identifiants et de l’utilisation de son compte.
- Les règles interdisent notamment le harcèlement, les menaces, les contenus illégaux/haineux/pornographiques, l’usurpation d’identité, le piratage, les DDoS, les injections, l’exploitation de vulnérabilités, le phishing, les logiciels malveillants, certains usages commerciaux non autorisés et les bots sans autorisation.
- Les groupes disposent de propriétaires, administrateurs et membres selon les fonctions disponibles. Les messages de groupe sont chiffrés côté client dans le fonctionnement normal.
- Les messages privés utilisent E2EE dans le fonctionnement normal. Les clés privées sont générées et utilisées côté client ; une sauvegarde chiffrée peut être stockée côté serveur.
- Le signalement volontaire peut transmettre le contenu de messages et jusqu’à 2 000 messages chargés pour une conversation entière, conformément aux modalités décrites dans la PDC.
- Les fichiers joints sont chiffrés côté client par morceaux avant transfert ; des métadonnées et clés sont également protégées. Les objets chiffrés sont stockés auprès de Filebase. Les limites techniques affichées dans le service peuvent évoluer.
- Les appels audio/vidéo utilisent WebRTC, microphone et caméra selon les autorisations de l’appareil. Leur disponibilité n’est pas garantie dans toutes les conditions réseau.
- Des mesures de modération peuvent inclure restriction, suspension temporaire ou bannissement permanent.
- Le contenu utilisateur reste sous la responsabilité de son auteur. Les contenus créés par les utilisateurs restent leur propriété, sous réserve des droits nécessaires au fonctionnement technique du service.
- Le nom Propard, le logo et le code source appartiennent à BananeVR, sous réserve des composants tiers.
- Le service est fourni sans garantie de disponibilité continue. Les CGU peuvent être modifiées ; le droit français s’applique sous réserve des dispositions impératives applicables.
- En cas de doute sur une formulation exacte, renvoie au texte intégral plutôt que de reconstituer un article ou une numérotation.

UTILISATION DES OUTILS ET CONFIDENTIALITÉ
- Tu peux consulter le profil non sensible, les amis et les groupes de l’utilisateur avec les outils disponibles.
- Tu peux préparer des brouillons privés ou de groupe, mais ne les envoie jamais. Une confirmation explicite dans l’interface est obligatoire.
- Le contenu des messages E2EE est déchiffré uniquement sur l’appareil. Il ne doit jamais être transmis à Groq, résumé par toi ou ajouté à l’historique IA.
- Ne demande ni mot de passe, ni clé privée, ni clé API, ni code de récupération.` 
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
      groqParam: error.groqParam || null,
      groqMessage: error.groqMessage || null,
      groqLimitTokens: error.groqLimitTokens || null,
      groqRemainingTokens: error.groqRemainingTokens || null,
      groqResetTokens: error.groqResetTokens || null,
      groqRetryAfter: error.groqRetryAfter || null
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
