const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
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
      reason,
      groupMessage,
      groupId
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
        error: 'Utilisateur signalÃ© invalide'
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
    // RÃCUPÃRATION DU MESSAGE
    // ============================

    let message = null;
    let group = null;
    let messageType = 'private';

    if (groupMessage) {
      messageType = 'group';

      if (
        !groupId ||
        !mongoose.isValidObjectId(groupId)
      ) {
        return res.status(400).json({
          error:
            'Groupe invalide'
        });
      }

      group =
        await Group.findById(
          groupId
        ).select('members');

      if (
        !group ||
        !group.members.some(member => {
          const memberId =
            member.userId?._id ||
            member.userId;

          return (
            memberId &&
            memberId.toString() ===
              reporterId.toString()
          );
        })
      ) {
        return res.status(403).json({
          error:
            'Signalement non autorisÃ© pour ce groupe'
        });
      }

      message =
        await GroupMessage.findOne({
          _id:
            messageId,
          group:
            groupId
        });

      if (!message) {
        return res.status(404).json({
          error:
            'Message introuvable (peut-Ãªtre dÃ©jÃ  supprimÃ©)'
        });
      }

      const senderId =
        message.sender.toString();

      if (
        senderId !==
          reportedUserId.toString() ||
        senderId ===
          reporterId.toString()
      ) {
        return res.status(403).json({
          error:
            'Signalement non autorisÃ© pour ce message'
        });
      }
    } else {
      message =
        await Message.findById(
          messageId
        );

      if (!message) {
        return res.status(404).json({
          error:
            'Message introuvable (peut-Ãªtre dÃ©jÃ  supprimÃ©)'
        });
      }

      const senderId =
        message.sender.toString();

      const receiverId =
        message.receiver.toString();

      const isParticipant =
        reporterId === senderId ||
        reporterId === receiverId;

      const senderMatchesReported =
        senderId === reportedUserId;

      /*
       * Le signalement doit :
       * - venir d'un participant Ã  la conversation
       * - concerner l'expÃ©diteur du message
       * - ne pas permettre de signaler son propre message
       */
      if (
        !isParticipant ||
        !senderMatchesReported ||
        senderId === reporterId
      ) {
        return res.status(403).json({
          error:
            'Signalement non autorisÃ© pour ce message'
        });
      }
    }

    // ============================
    // ÃVITER LES DOUBLONS
    // ============================

    const existingReportQuery = {
      reporter:
        reporterId,
      status:
        'new'
    };

    if (messageType === 'group') {
      existingReportQuery.groupMessageId =
        messageId;
    } else {
      existingReportQuery.messageId =
        messageId;
    }

    const existingReport =
      await Report.findOne(
        existingReportQuery
      );

    if (existingReport) {
      return res.status(409).json({
        error:
          'Ce message a dÃ©jÃ  Ã©tÃ© signalÃ©.'
      });
    }

    // ============================
    // VÃRIFICATION DES UTILISATEURS
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
        error: 'Utilisateur signalÃ© introuvable'
      });
    }

    // ============================
    // CRÃATION DU SIGNALEMENT
    // ============================

    const reportData = {
      reporter:
        reporterId,
      reportedUser:
        reportedUserId,
      content:
        content.trim(),
      reason:
        reason?.trim() || null,
      messageCreatedAt:
        message.createdAt,
      messageType,
      status:
        'new'
    };

    if (messageType === 'group') {
      reportData.groupMessageId =
        messageId;
      reportData.groupId =
        groupId;
    } else {
      reportData.messageId =
        messageId;
    }

    const report =
      await Report.create(
        reportData
      );

    // Le cooldown n'est activÃ© qu'aprÃ¨s
    // la rÃ©ussite de l'enregistrement.
    lastReportTimes.set(
      reporterId,
      Date.now()
    );

    console.log(
      `ð© Nouveau signalement ${report._id} : ` +
      `${reporter.username} -> ${reportedUser.username}`
    );

    return res.status(201).json({
      success: true,
      message:
        'Signalement envoyÃ©, merci.'
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