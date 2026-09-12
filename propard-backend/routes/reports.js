const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const User = require('../models/User');
const Message = require('../models/Message');
const Report = require('../models/Report');

const authMiddleware = require('../middleware/auth');

// Anti-spam basique : 1 signalement max toutes les 15 secondes par compte.
const lastReportTimes = new Map();
const REPORT_COOLDOWN_MS = 15000;

router.post('/', authMiddleware, async (req, res) => {
  try {
    const reporterId = req.user.id;

    const {
      messageId,
      reportedUserId,
      content,
      reason
    } = req.body;

    // ============================
    // VALIDATION
    // ============================

    if (!messageId || !mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({
        error: 'Message invalide'
      });
    }

    if (
      !reportedUserId ||
      !mongoose.isValidObjectId(reportedUserId)
    ) {
      return res.status(400).json({
        error: 'Utilisateur signalé invalide'
      });
    }

    if (
      !content ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      return res.status(400).json({
        error: 'Contenu du message requis'
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        error: 'Contenu trop long'
      });
    }

    if (
      reason &&
      (
        typeof reason !== 'string' ||
        reason.length > 500
      )
    ) {
      return res.status(400).json({
        error: 'Motif invalide'
      });
    }

    // ============================
    // COOLDOWN
    // ============================

    const last = lastReportTimes.get(reporterId) || 0;

    if (Date.now() - last < REPORT_COOLDOWN_MS) {
      return res.status(429).json({
        error:
          'Merci de patienter avant un nouveau signalement.'
      });
    }

    // ============================
    // RÉCUPÉRATION DU MESSAGE
    // ============================

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        error:
          'Message introuvable (peut-être déjà supprimé)'
      });
    }

    const senderId = message.sender.toString();
    const receiverId = message.receiver.toString();

    const isParticipant =
      reporterId === senderId ||
      reporterId === receiverId;

    const senderMatchesReported =
      senderId === reportedUserId;

    /*
     * Le signalement doit :
     * - venir d'un participant à la conversation
     * - concerner l'expéditeur du message
     * - ne pas permettre de signaler son propre message
     */

    if (
      !isParticipant ||
      !senderMatchesReported ||
      senderId === reporterId
    ) {
      return res.status(403).json({
        error:
          'Signalement non autorisé pour ce message'
      });
    }

    // ============================
    // ÉVITER LES DOUBLONS
    // ============================

    const existingReport = await Report.findOne({
      reporter: reporterId,
      messageId,
      status: 'new'
    });

    if (existingReport) {
      return res.status(409).json({
        error:
          'Ce message a déjà été signalé.'
      });
    }

    // ============================
    // VÉRIFICATION DES UTILISATEURS
    // ============================

    const [reporter, reportedUser] = await Promise.all([
      User.findById(reporterId).select('username'),
      User.findById(reportedUserId).select('username')
    ]);

    if (!reporter) {
      return res.status(401).json({
        error: 'Compte signalant introuvable'
      });
    }

    if (!reportedUser) {
      return res.status(404).json({
        error: 'Utilisateur signalé introuvable'
      });
    }

    // ============================
    // CRÉATION DU SIGNALEMENT
    // ============================

    const report = await Report.create({
      reporter: reporterId,
      reportedUser: reportedUserId,
      messageId,
      content: content.trim(),
      reason: reason?.trim() || null,
      messageCreatedAt: message.createdAt,
      status: 'new'
    });

    // Le cooldown n'est activé qu'après
    // la réussite de l'enregistrement.
    lastReportTimes.set(
      reporterId,
      Date.now()
    );

    console.log(
      `🚩 Nouveau signalement ${report._id} : ` +
      `${reporter.username} -> ${reportedUser.username}`
    );

    return res.status(201).json({
      success: true,
      message:
        'Signalement envoyé, merci.'
    });

  } catch (err) {
    console.error(
      'Erreur signalement:',
      err
    );

    return res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

module.exports = router;