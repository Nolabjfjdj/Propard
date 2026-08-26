const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Announcement = require('../models/Announcement');
const authMiddleware = require('../middleware/auth');


/*
 * ============================================================
 * ANNONCE ACTIVE POUR L'UTILISATEUR CONNECTÉ
 * ============================================================
 */

router.get('/active', authMiddleware, async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      active: true
    }).sort({
      createdAt: -1
    });

    if (!announcement) {
      return res.json({
        announcement: null
      });
    }

    const user = await User.findById(req.user.id)
      .select('acceptedAnnouncements');

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const alreadyAccepted =
      Array.isArray(user.acceptedAnnouncements) &&
      user.acceptedAnnouncements.some(item =>
        item.announcementId &&
        item.announcementId.toString() ===
        announcement._id.toString()
      );

    if (alreadyAccepted) {
      return res.json({
        announcement: null
      });
    }

    res.json({
      announcement: {
        _id: announcement._id,
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.createdAt
      }
    });

  } catch (err) {
    console.error('announcement active error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


/*
 * ============================================================
 * ACCEPTER UNE ANNONCE
 * ============================================================
 */

router.post('/:announcementId/accept', authMiddleware, async (req, res) => {
  try {
    const {
      announcementId
    } = req.params;

    if (!announcementId) {
      return res.status(400).json({
        error: 'Annonce invalide'
      });
    }

    const announcement = await Announcement.findOne({
      _id: announcementId,
      active: true
    });

    if (!announcement) {
      return res.status(404).json({
        error: 'Annonce introuvable'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    if (!Array.isArray(user.acceptedAnnouncements)) {
      user.acceptedAnnouncements = [];
    }

    const alreadyAccepted =
      user.acceptedAnnouncements.some(item =>
        item.announcementId &&
        item.announcementId.toString() ===
        announcement._id.toString()
      );

    if (!alreadyAccepted) {
      user.acceptedAnnouncements.push({
        announcementId: announcement._id,
        acceptedAt: new Date()
      });

      await user.save();
    }

    res.json({
      success: true
    });

  } catch (err) {
    console.error('announcement accept error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


module.exports = router;