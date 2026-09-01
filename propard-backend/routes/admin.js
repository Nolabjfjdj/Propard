const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const Announcement = require('../models/Announcement');
const { createRateLimiter } = require('../middleware/rateLimit');

/*
 * Vérification des clés secrètes.
 *
 * Les clés restent exclusivement dans les variables d'environnement
 * du backend.
 */
function checkKey(providedKey, environmentKey) {
  if (
    typeof providedKey !== 'string' ||
    typeof environmentKey !== 'string' ||
    !providedKey ||
    !environmentKey
  ) {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(environmentKey);

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

/*
 * Évite qu'un username fourni par l'admin soit interprété
 * comme une expression régulière.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ces routes ne sont protégées que par une clé secrète (pas de JWT), donc
// un rate limit strict par IP est important pour rendre le brute-force de
// la clé impraticable — même une clé "très longue et aléatoire" mérite
// cette défense en profondeur.
const adminSensitiveLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => req.ip,
  message: 'Trop de tentatives, réessaie plus tard.'
});


/*
 * ============================================================
 * RÉINITIALISATION DE MOT DE PASSE
 * ============================================================
 */

router.post('/reset-password', adminSensitiveLimiter, async (req, res) => {
  try {
    const {
      adminKey,
      username,
      newPassword
    } = req.body;

    if (!checkKey(adminKey, process.env.ADMIN_KEY)) {
      return res.status(403).json({
        error: 'Accès refusé'
      });
    }

    if (!username || !newPassword) {
      return res.status(400).json({
        error: 'Username et nouveau mot de passe requis'
      });
    }

    if (typeof username !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({
        error: 'Données invalides'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Mot de passe minimum 8 caractères'
      });
    }

    const safeUsername = escapeRegex(username);

    const user = await User.findOne({
      username: {
        $regex: new RegExp(`^${safeUsername}$`, 'i')
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur introuvable'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    await user.save();

    res.json({
      success: true,
      message: `Mot de passe de ${user.username} réinitialisé`
    });

  } catch (err) {
    console.error('reset-password error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


/*
 * ============================================================
 * CRÉER UNE ANNONCE GLOBALE
 * ============================================================
 */

router.post('/announcement/create', adminSensitiveLimiter, async (req, res) => {
  try {
    const {
      announcementKey,
      title,
      message
    } = req.body;

    if (
      !checkKey(
        announcementKey,
        process.env.ADMIN_KEY_ANNOUNCEMENT
      )
    ) {
      return res.status(403).json({
        error: 'Clé annonce incorrecte'
      });
    }

    if (
      typeof title !== 'string' ||
      typeof message !== 'string' ||
      !title.trim() ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: 'Titre et message requis'
      });
    }

    if (title.trim().length > 150) {
      return res.status(400).json({
        error: 'Titre trop long'
      });
    }

    if (message.trim().length > 5000) {
      return res.status(400).json({
        error: 'Message trop long'
      });
    }

    /*
     * Désactive toutes les anciennes annonces.
     */
    await Announcement.updateMany(
      { active: true },
      { $set: { active: false } }
    );

    /*
     * Crée la nouvelle annonce.
     */
    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      active: true
    });

    /*
     * Si des clients utilisent déjà Socket.IO pour autre chose,
     * on diffuse également l'événement.
     *
     * Le frontend utilise aussi une vérification périodique,
     * donc l'annonce fonctionne même si un client n'écoute pas
     * cet événement.
     */
    const io = req.app.get('io');

    if (io) {
      io.emit('globalAnnouncement', {
        _id: announcement._id.toString(),
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.createdAt
      });
    }

    res.json({
      success: true,
      message: 'Annonce publiée',
      announcement: {
        _id: announcement._id,
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.createdAt
      }
    });

  } catch (err) {
    console.error('announcement/create error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


/*
 * ============================================================
 * RÉCUPÉRER L'ANNONCE ACTIVE
 * ============================================================
 *
 * Cette route est surtout destinée au panneau admin. Pas de clé secrète
 * requise (lecture seule, non sensible) donc pas de rate limit strict ici.
 */

router.get('/announcement', async (req, res) => {
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

    res.json({
      announcement: {
        _id: announcement._id,
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.createdAt
      }
    });

  } catch (err) {
    console.error('announcement get error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


/*
 * ============================================================
 * SUPPRIMER / DÉSACTIVER L'ANNONCE ACTIVE
 * ============================================================
 */

router.post('/announcement/delete', adminSensitiveLimiter, async (req, res) => {
  try {
    const {
      announcementKey
    } = req.body;

    if (
      !checkKey(
        announcementKey,
        process.env.ADMIN_KEY_ANNOUNCEMENT
      )
    ) {
      return res.status(403).json({
        error: 'Clé annonce incorrecte'
      });
    }

    await Announcement.updateMany(
      { active: true },
      { $set: { active: false } }
    );

    const io = req.app.get('io');

    if (io) {
      io.emit('globalAnnouncementRemoved');
    }

    res.json({
      success: true,
      message: 'Annonce désactivée'
    });

  } catch (err) {
    console.error('announcement/delete error:', err);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


module.exports = router;
