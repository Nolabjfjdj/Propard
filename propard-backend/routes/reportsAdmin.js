const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Report = require('../models/Report');

const router = express.Router();

// ========================================
// RATE LIMITER ADMIN SIGNALMENTS
// ========================================

const attempts = new Map();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(req) {
  const key = req.ip || 'unknown';
  const now = Date.now();

  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    attempts.set(key, {
      firstAttempt: now,
      count: 1
    });

    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;

  return true;
}

// Nettoyage périodique de la mémoire
setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of attempts.entries()) {
    if (
      now - entry.firstAttempt >
      RATE_LIMIT_WINDOW_MS
    ) {
      attempts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// ========================================
// VÉRIFICATION CLÉ
// ========================================

function checkKey(providedKey, environmentKey) {
  if (
    typeof providedKey !== 'string' ||
    typeof environmentKey !== 'string' ||
    !providedKey ||
    !environmentKey
  ) {
    return false;
  }

  const providedBuffer =
    Buffer.from(providedKey);

  const environmentBuffer =
    Buffer.from(environmentKey);

  if (
    providedBuffer.length !==
    environmentBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    providedBuffer,
    environmentBuffer
  );
}

// ========================================
// AUTH ADMIN
// ========================================

function requireReportsAdmin(req, res, next) {
  if (!checkRateLimit(req)) {
    return res.status(429).json({
      error:
        'Trop de tentatives, réessaie plus tard.'
    });
  }

  const adminKey =
    req.body?.reportKey;

  const expectedKey =
    process.env.ADMIN_KEY_REPORTS;

  if (
    !checkKey(
      adminKey,
      expectedKey
    )
  ) {
    return res.status(403).json({
      error: 'Clé admin invalide'
    });
  }

  next();
}

// ========================================
// LISTE DES SIGNALEMENTS
// ========================================

router.post(
  '/list',
  requireReportsAdmin,
  async (req, res) => {
    try {
      const reports = await Report.find({})
        .sort({
          createdAt: -1
        })
        .limit(100)
        .populate(
          'reporter',
          'username displayName'
        )
        .populate(
          'reportedUser',
          'username displayName'
        )
        .lean();

      const newCount =
        reports.filter(
          report =>
            report.status === 'new'
        ).length;

      return res.json({
        success: true,
        reports,
        newCount
      });

    } catch (err) {
      console.error(
        'Erreur récupération signalements:',
        err
      );

      return res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

// ========================================
// CHANGER LE STATUT
// ========================================

router.post(
  '/:reportId/status',
  requireReportsAdmin,
  async (req, res) => {
    try {
      const {
        reportId
      } = req.params;

      const {
        status
      } = req.body;

      if (
        !mongoose.isValidObjectId(
          reportId
        )
      ) {
        return res.status(400).json({
          error:
            'Signalement invalide'
        });
      }

      if (
        ![
          'new',
          'processed',
          'rejected'
        ].includes(status)
      ) {
        return res.status(400).json({
          error:
            'Statut invalide'
        });
      }

      const report =
        await Report.findById(
          reportId
        );

      if (!report) {
        return res.status(404).json({
          error:
            'Signalement introuvable'
        });
      }

      report.status = status;

      if (status === 'new') {
        report.processedAt = null;
      } else {
        report.processedAt =
          new Date();
      }

      await report.save();

      return res.json({
        success: true,
        message:
          'Statut du signalement mis à jour.'
      });

    } catch (err) {
      console.error(
        'Erreur statut signalement:',
        err
      );

      return res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

// ========================================
// SUPPRIMER UN SIGNALEMENT
// ========================================

router.post(
  '/:reportId/delete',
  requireReportsAdmin,
  async (req, res) => {
    try {
      const {
        reportId
      } = req.params;

      if (
        !mongoose.isValidObjectId(
          reportId
        )
      ) {
        return res.status(400).json({
          error:
            'Signalement invalide'
        });
      }

      const result =
        await Report.deleteOne({
          _id: reportId
        });

      if (
        result.deletedCount === 0
      ) {
        return res.status(404).json({
          error:
            'Signalement introuvable'
        });
      }

      return res.json({
        success: true,
        message:
          'Signalement supprimé.'
      });

    } catch (err) {
      console.error(
        'Erreur suppression signalement:',
        err
      );

      return res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

module.exports = router;