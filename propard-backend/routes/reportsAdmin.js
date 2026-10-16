const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Report = require('../models/Report');
const StaffAuditLog = require('../models/StaffAuditLog');
const authMiddleware = require('../middleware/auth');
const { requireStaffRole } = require('../middleware/staffRoles');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ========================================
// RATE LIMITER ADMIN SIGNALMENTS
// ========================================

const reportsAdminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: req => req.ip || 'unknown',
  message: 'Trop de tentatives, réessaie plus tard.',
  captcha: true,
  resetOnCaptcha: true
});

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
  authMiddleware,
  requireStaffRole('senior_moderator'),
  reportsAdminLimiter,
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

      await StaffAuditLog.create({
        actor: req.user.id,
        action: 'report.bulk_review.accessed',
        details: { count: reports.length },
        ip: typeof req.ip === 'string' ? req.ip.slice(0, 128) : null,
        userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 512) : null
      });

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
  authMiddleware,
  requireStaffRole('junior_moderator'),
  reportsAdminLimiter,
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
  authMiddleware,
  requireStaffRole('senior_moderator'),
  reportsAdminLimiter,
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