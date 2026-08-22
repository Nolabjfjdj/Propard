const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { sendReportEmail } = require('../utils/mailer');

// Anti-spam basique : 1 signalement max toutes les 15 secondes par compte.
// Pas de captcha ici, comme demandé — le cooldown suffit pour ce cas d'usage.
const lastReportTimes = new Map();
const REPORT_COOLDOWN_MS = 15000;

router.post('/', authMiddleware, async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { messageId, reportedUserId, content, reason } = req.body;

    if (!messageId || !mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ error: 'Message invalide' });
    }
    if (!reportedUserId || !mongoose.isValidObjectId(reportedUserId)) {
      return res.status(400).json({ error: 'Utilisateur signalé invalide' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Contenu du message requis' });
    }
    if (content.length > 5000) {
      return res.status(400).json({ error: 'Contenu trop long' });
    }
    if (reason && (typeof reason !== 'string' || reason.length > 500)) {
      return res.status(400).json({ error: 'Motif invalide' });
    }

    const last = lastReportTimes.get(reporterId) || 0;
    if (Date.now() - last < REPORT_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Merci de patienter avant un nouveau signalement.' });
    }

    // Le serveur ne peut PAS déchiffrer le message lui-même (il n'a jamais
    // les clés privées). On vérifie seulement que ce message existe bien
    // dans une conversation réelle entre ces deux comptes, pas que le
    // texte fourni correspond exactement au contenu chiffré stocké —
    // c'est la même limite de confiance que sur un signalement Signal ou
    // WhatsApp.
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message introuvable (peut-être déjà supprimé)' });
    }

    const senderId = message.sender.toString();
    const receiverId = message.receiver.toString();
    const isParticipant = reporterId === senderId || reporterId === receiverId;
    const senderMatchesReported = senderId === reportedUserId;

    if (!isParticipant || !senderMatchesReported || senderId === reporterId) {
      return res.status(403).json({ error: 'Signalement non autorisé pour ce message' });
    }

    lastReportTimes.set(reporterId, Date.now());

    const [reporter, reportedUser] = await Promise.all([
      User.findById(reporterId).select('username'),
      User.findById(reportedUserId).select('username')
    ]);

    // Volontairement AUCUNE écriture en base ici — le contenu signalé
    // n'existe nulle part côté serveur en dehors de cet email.
    await sendReportEmail({
      reporter,
      reportedUser,
      messageId,
      content: content.trim(),
      reason: reason?.trim() || null,
      messageCreatedAt: message.createdAt
    });

    res.json({ success: true, message: 'Signalement envoyé, merci.' });
  } catch (err) {
    console.error('Erreur signalement:', err);
    res.status(500).json({ error: err.message?.includes('non configuré') ? err.message : 'Erreur serveur' });
  }
});

module.exports = router;
