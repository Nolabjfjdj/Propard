const express = require('express');
const mongoose = require('mongoose');
const { randomBytes } = require('crypto');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { isEncryptedMessagePayload } = require('../utils/inputValidation');
const User = require('../models/User');
const Group = require('../models/Group');
const FileAttachment = require('../models/FileAttachment');
const {
  selectFilebaseStorageId,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  headStoredObject
} = require('../services/filebase');
const { deleteMessageAttachments } = require('../services/fileCleanup');

const CHUNK_SIZE = 8 * 1024 * 1024;
const IMAGE_MAX_SIZE = 50 * 1024 * 1024;
const VIDEO_MAX_SIZE = 1024 * 1024 * 1024;
const DOCUMENT_MAX_SIZE = 250 * 1024 * 1024;
const MAX_FILE_SIZE = VIDEO_MAX_SIZE;
const MAX_CHUNKS = 640;
const MAX_KEY_PACKAGES = 50;
const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;
const MAX_CONSECUTIVE_LARGE_FILES = 3;
const LARGE_FILE_COOLDOWN_MS = 30 * 60 * 1000;
const FILE_UPLOAD_WINDOW_MS = 5 * 60 * 1000;
const MAX_FILES_PER_WINDOW = 10;
const MAX_BYTES_PER_WINDOW = 2 * 1024 * 1024 * 1024;

router.use(authMiddleware);

const uploadRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyFn: req => `file-upload:${req.user.id}`,
  message: 'Trop de préparations de fichiers. Réessaie plus tard.'
});

const signedUrlRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyFn: req => `file-signed-url:${req.user.id}`,
  message: 'Trop de demandes de liens de fichiers. Réessaie dans un instant.'
});

function isCanonicalIv(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 12 && decoded.toString('base64') === value;
  } catch {
    return false;
  }
}

function validKeyPackages(packages, expectedUserIds, keyVersion) {
  if (
    !Array.isArray(packages) ||
    packages.length !== expectedUserIds.length ||
    packages.length < 1 ||
    packages.length > MAX_KEY_PACKAGES
  ) {
    return false;
  }

  const expected = new Set(expectedUserIds.map(id => id.toString()));
  const seen = new Set();

  for (const item of packages) {
    if (
      !item ||
      typeof item.userId !== 'string' ||
      !mongoose.isValidObjectId(item.userId) ||
      typeof item.encryptedKey !== 'string' ||
      !isEncryptedMessagePayload(item.encryptedKey) ||
      item.encryptedKey.length < 1 ||
      item.encryptedKey.length > 10000 ||
      item.keyVersion !== keyVersion
    ) {
      return false;
    }

    const userId = item.userId.toString();
    if (!expected.has(userId) || seen.has(userId)) return false;
    seen.add(userId);
  }

  return seen.size === expected.size;
}

async function getAuthorizedFile(file, userId) {
  const currentUserId = userId.toString();

  if (file.scope === 'private') {
    const recipientId = file.recipient?.toString();
    const senderId = file.sender.toString();

    if (currentUserId !== senderId && currentUserId !== recipientId) {
      return null;
    }

    const sender = await User.findById(file.sender).select('friends blockedUsers');
    const recipient = await User.findById(file.recipient).select('friends blockedUsers');

    if (!sender || !recipient) return null;

    const senderHasRecipient = (sender.friends || []).some(
      item => item.userId?.toString() === recipientId
    );
    const recipientHasSender = (recipient.friends || []).some(
      item => item.userId?.toString() === senderId
    );
    const senderBlockedRecipient = (sender.blockedUsers || []).some(
      id => id.toString() === recipientId
    );
    const recipientBlockedSender = (recipient.blockedUsers || []).some(
      id => id.toString() === senderId
    );

    if (
      !senderHasRecipient ||
      !recipientHasSender ||
      senderBlockedRecipient ||
      recipientBlockedSender
    ) return null;
    const keyPackage = file.keyPackages.find(
      item => item.userId.toString() === currentUserId
    );

    return keyPackage?.keyVersion === 1 ? keyPackage : null;
  }

  if (file.scope === 'group') {
    const group = await Group.findOne({
      _id: file.group,
      'members.userId': userId
    }).select('members');

    if (!group) return null;

    const membership = group.members.find(
      member => member.userId.toString() === currentUserId
    );

    if (
      !membership ||
      !membership.joinedAt ||
      new Date(membership.joinedAt) > new Date(file.createdAt)
    ) {
      return null;
    }

    const keyPackage = file.keyPackages.find(
      item => item.userId.toString() === currentUserId
    );

    return keyPackage?.keyVersion === file.groupKeyVersion ? keyPackage : null;
  }

  return null;
}

router.post('/uploads', uploadRateLimit, async (req, res) => {
  try {
    const {
      scope,
      recipientId,
      groupId,
      groupKeyVersion,
      category,
      originalSize,
      chunkSize,
      chunkCount,
      encryptedMetadata,
      keyPackages,
      senderPublicKey: claimedSenderPublicKey,
      batchId
    } = req.body || {};

    if (
      !['private', 'group'].includes(scope) ||
      !['image', 'video', 'audio', 'document'].includes(category) ||
      typeof batchId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(batchId) ||
      !Number.isSafeInteger(originalSize) ||
      originalSize < 1 ||
      originalSize > MAX_FILE_SIZE ||
      chunkSize !== CHUNK_SIZE ||
      !Number.isSafeInteger(chunkCount) ||
      chunkCount !== Math.ceil(originalSize / CHUNK_SIZE) ||
      chunkCount < 1 ||
      chunkCount > MAX_CHUNKS ||
      typeof encryptedMetadata !== 'string' ||
      !isEncryptedMessagePayload(encryptedMetadata) ||
      encryptedMetadata.length < 1 ||
      encryptedMetadata.length > 20000
    ) {
      return res.status(400).json({ error: 'Paramètres du fichier invalides.' });
    }

    const categoryLimit = category === 'image'
      ? IMAGE_MAX_SIZE
      : category === 'video'
        ? VIDEO_MAX_SIZE
        : DOCUMENT_MAX_SIZE;

    if (originalSize > categoryLimit) {
      return res.status(413).json({ error: 'Ce fichier dépasse la limite autorisée pour son type.' });
    }

    const batchFiles = await FileAttachment.find({
      sender: req.user.id,
      batchId,
      status: { $in: ['uploading', 'ready'] }
    }).select('originalSize');

    const batchSize = batchFiles.reduce((total, item) => total + item.originalSize, 0);
    const senderAccount = await User.findById(req.user.id).select('publicKey');

    let senderPublicKey;
    try {
      senderPublicKey = JSON.parse(senderAccount?.publicKey || 'null');
    } catch {
      senderPublicKey = null;
    }

    if (
      !senderPublicKey ||
      senderPublicKey.kty !== 'EC' ||
      senderPublicKey.crv !== 'P-256' ||
      typeof senderPublicKey.x !== 'string' ||
      typeof senderPublicKey.y !== 'string' ||
      senderAccount.publicKey.length > 2000 ||
      !claimedSenderPublicKey ||
      typeof claimedSenderPublicKey !== 'string' ||
      claimedSenderPublicKey.length > 2000
    ) {
      return res.status(400).json({ error: 'Clé publique E2EE de l’émetteur indisponible.' });
    }

    let claimedPublicKey;
    try {
      claimedPublicKey = JSON.parse(claimedSenderPublicKey);
    } catch {
      claimedPublicKey = null;
    }

    if (
      !claimedPublicKey ||
      claimedPublicKey.kty !== 'EC' ||
      claimedPublicKey.crv !== 'P-256' ||
      claimedPublicKey.x !== senderPublicKey.x ||
      claimedPublicKey.y !== senderPublicKey.y
    ) {
      return res.status(409).json({ error: 'Ta clé privée E2EE ne correspond plus à la clé publique du compte.' });
    }

    if (
      batchFiles.length >= 10 ||
      batchSize + originalSize > 2 * 1024 * 1024 * 1024
    ) {
      return res.status(413).json({ error: 'La sélection dépasse la limite de 10 fichiers ou 2 Go.' });
    }

    let expectedUserIds;
    let recipient = null;
    let group = null;
    let currentKeyVersion = 1;

    if (scope === 'private') {
      if (
        !mongoose.isValidObjectId(recipientId) ||
        recipientId.toString() === req.user.id.toString() ||
        groupId !== undefined ||
        groupKeyVersion !== undefined
      ) {
        return res.status(400).json({ error: 'Conversation privée invalide.' });
      }

      const [senderUser, recipientUser] = await Promise.all([
        User.findById(req.user.id).select('friends blockedUsers'),
        User.findById(recipientId).select('friends blockedUsers')
      ]);

      if (!senderUser || !recipientUser) {
        return res.status(404).json({ error: 'Utilisateur introuvable.' });
      }

      const senderHasRecipient = (senderUser.friends || []).some(
        item => item.userId?.toString() === recipientId.toString()
      );
      const recipientHasSender = (recipientUser.friends || []).some(
        item => item.userId?.toString() === req.user.id.toString()
      );
      const senderBlockedRecipient = (senderUser.blockedUsers || []).some(
        id => id.toString() === recipientId.toString()
      );
      const recipientBlockedSender = (recipientUser.blockedUsers || []).some(
        id => id.toString() === req.user.id.toString()
      );

      if (
        !senderHasRecipient ||
        !recipientHasSender ||
        senderBlockedRecipient ||
        recipientBlockedSender
      ) {
        return res.status(403).json({ error: 'Cette conversation ne permet pas l’envoi de fichiers.' });
      }

      recipient = recipientId;
      expectedUserIds = [req.user.id.toString(), recipientId.toString()];
    } else {
      if (
        !mongoose.isValidObjectId(groupId) ||
        recipientId !== undefined ||
        !Number.isSafeInteger(groupKeyVersion) ||
        groupKeyVersion < 1
      ) {
        return res.status(400).json({ error: 'Conversation de groupe invalide.' });
      }

      group = await Group.findOne({
        _id: groupId,
        'members.userId': req.user.id
      }).select('members keyVersion');

      if (!group) {
        return res.status(403).json({ error: 'Tu ne fais pas partie de ce groupe.' });
      }

      currentKeyVersion = Number.isSafeInteger(group.keyVersion) && group.keyVersion > 0
        ? group.keyVersion
        : 1;

      if (groupKeyVersion !== currentKeyVersion) {
        return res.status(409).json({ error: 'La clé du groupe a changé. Recharge le groupe.' });
      }

      expectedUserIds = group.members.map(member => member.userId.toString());
    }

    if (!validKeyPackages(keyPackages, expectedUserIds, currentKeyVersion)) {
      return res.status(400).json({ error: 'Paquets de clés E2EE invalides ou incomplets.' });
    }

    const uploadNow = new Date();
    const uploadAccount = await User.findById(req.user.id)
      .select('largeFileUploadBlockedUntil');

    if (!uploadAccount) {
      return res.status(404).json({ error: 'Compte introuvable.' });
    }

    if (
      originalSize >= LARGE_FILE_THRESHOLD &&
      uploadAccount.largeFileUploadBlockedUntil &&
      uploadAccount.largeFileUploadBlockedUntil > uploadNow
    ) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((uploadAccount.largeFileUploadBlockedUntil.getTime() - uploadNow.getTime()) / 1000)
      );

      return res.status(429).json({
        error: 'Tu as envoyé 3 fichiers volumineux terminés à la suite. Réessaie dans 30 minutes.',
        retryAfterSeconds
      });
    }

    const storageId = selectFilebaseStorageId();

    const file = await FileAttachment.create({
      sender: req.user.id,
      scope,
      category,
      recipient,
      group: group?._id || null,
      groupKeyVersion: scope === 'group' ? currentKeyVersion : null,
      storageId,
      senderPublicKey: JSON.stringify(senderPublicKey),
      batchId,
      encryptedMetadata,
      cryptoVersion: 1,
      originalSize,
      chunkSize: CHUNK_SIZE,
      chunkCount,
      keyPackages: keyPackages.map(item => ({
        userId: item.userId,
        encryptedKey: item.encryptedKey,
        keyVersion: item.keyVersion
      })),
      status: 'uploading',
      uploadExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    res.status(201).json({
      fileId: file._id.toString(),
      storageId,
      chunkSize: CHUNK_SIZE,
      chunkCount,
      expiresIn: 60 * 60
    });
  } catch (error) {
    console.error('File upload initialization error:', error);
    res.status(500).json({ error: 'Impossible de préparer l’envoi du fichier.' });
  }
});

router.post(
  '/uploads/:fileId/chunks/:index/url',
  signedUrlRateLimit,
  async (req, res) => {
    try {
      const { fileId, index } = req.params;

      if (!mongoose.isValidObjectId(fileId) || !/^\d{1,3}$/.test(index)) {
        return res.status(400).json({ error: 'Identifiant de fichier ou index invalide.' });
      }

      const chunkIndex = Number(index);
      const file = await FileAttachment.findOne({
        _id: fileId,
        sender: req.user.id,
        status: 'uploading',
        uploadExpiresAt: { $gt: new Date() }
      });

      if (!file || chunkIndex < 0 || chunkIndex >= file.chunkCount) {
        return res.status(404).json({ error: 'Envoi introuvable ou expiré.' });
      }

      if (!(await getAuthorizedFile(file, req.user.id))) {
        return res.status(403).json({ error: 'Tu n’es plus autorisé à envoyer ce fichier dans cette conversation.' });
      }

      const { iv, sha256, encryptedSize } = req.body || {};
      const expectedPlainSize = Math.min(
        file.chunkSize,
        file.originalSize - chunkIndex * file.chunkSize
      );

      if (
        !isCanonicalIv(iv) ||
        typeof sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(sha256) ||
        encryptedSize !== expectedPlainSize + 16
      ) {
        return res.status(400).json({ error: 'Métadonnées du morceau invalides.' });
      }

      let chunk = file.chunks.find(item => item.index === chunkIndex);

      if (chunk) {
        if (
          chunk.iv !== iv ||
          chunk.sha256 !== sha256 ||
          chunk.encryptedSize !== encryptedSize ||
          chunk.storageId !== file.storageId
        ) {
          return res.status(409).json({ error: 'Ce morceau a déjà été préparé avec d’autres données.' });
        }
      } else {
        const objectKey = `uploads/${file._id.toString()}/${chunkIndex}-${randomBytes(16).toString('hex')}.bin`;
        const chunkData = {
          index: chunkIndex,
          storageId: file.storageId,
          objectKey,
          encryptedSize,
          iv,
          sha256
        };

        const update = await FileAttachment.updateOne(
          {
            _id: file._id,
            sender: req.user.id,
            status: 'uploading',
            'chunks.index': { $ne: chunkIndex }
          },
          { $push: { chunks: chunkData } },
          { runValidators: true }
        );

        if (update.modifiedCount !== 1) {
          const refreshed = await FileAttachment.findOne({
            _id: file._id,
            sender: req.user.id,
            status: 'uploading'
          });
          chunk = refreshed?.chunks.find(item => item.index === chunkIndex);

          if (
            !chunk ||
            chunk.iv !== iv ||
            chunk.sha256 !== sha256 ||
            chunk.encryptedSize !== encryptedSize
          ) {
            return res.status(409).json({ error: 'Préparation concurrente du morceau. Réessaie.' });
          }
        } else {
          chunk = chunkData;
        }
      }

      const uploadUrl = await createPresignedUploadUrl(
        chunk.objectKey,
        300,
        file.storageId
      );

      res.json({
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        expiresIn: 300
      });
    } catch (error) {
      console.error('File chunk URL error:', error);
      res.status(500).json({ error: 'Impossible de préparer le transfert du morceau.' });
    }
  }
);

router.post('/uploads/:fileId/finalize', signedUrlRateLimit, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ error: 'Identifiant de fichier invalide.' });
    }

    const file = await FileAttachment.findOne({
      _id: fileId,
      sender: req.user.id,
      status: 'uploading',
      uploadExpiresAt: { $gt: new Date() }
    });

    if (!file) {
      return res.status(404).json({ error: 'Envoi introuvable ou déjà finalisé.' });
    }

    if (!(await getAuthorizedFile(file, req.user.id))) {
      return res.status(403).json({ error: 'Tu n’es plus autorisé à finaliser ce fichier.' });
    }

    if (file.chunks.length !== file.chunkCount) {
      return res.status(409).json({ error: 'Tous les morceaux du fichier ne sont pas encore préparés.' });
    }

    const chunks = [...file.chunks].sort((a, b) => a.index - b.index);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];

      if (chunk.index !== index || chunk.storageId !== file.storageId) {
        return res.status(409).json({ error: 'Manifeste du fichier incomplet ou invalide.' });
      }

      const storedObject = await headStoredObject(chunk.objectKey, chunk.storageId);

      if (storedObject.size !== chunk.encryptedSize) {
        return res.status(409).json({ error: `Le morceau ${index + 1} est absent ou incomplet.` });
      }
    }

    const updated = await FileAttachment.findOneAndUpdate(
      { _id: file._id, sender: req.user.id, status: 'uploading' },
      {
        $set: {
          chunks: chunks.map(chunk => ({
            ...chunk.toObject(),
            uploadedAt: new Date()
          })),
          status: 'ready',
          completedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({ error: 'Le fichier a déjà changé d’état.' });
    }

    const completedAt = new Date();
    const windowStart = new Date(completedAt.getTime() - FILE_UPLOAD_WINDOW_MS);
    const recentEvents = {
      $filter: {
        input: { $ifNull: ['$fileUploadEvents', []] },
        as: 'event',
        cond: { $gt: ['$$event.completedAt', windowStart] }
      }
    };

    let quotaReservation;
    try {
      quotaReservation = await User.updateOne(
        {
          _id: req.user.id,
          $expr: {
            $and: [
              { $lt: [{ $size: recentEvents }, MAX_FILES_PER_WINDOW] },
              {
                $lte: [
                  {
                    $add: [
                      {
                        $sum: {
                          $map: {
                            input: recentEvents,
                            as: 'event',
                            in: '$$event.size'
                          }
                        }
                      },
                      updated.originalSize
                    ]
                  },
                  MAX_BYTES_PER_WINDOW
                ]
              }
            ]
          }
        },
        [
          {
            $set: {
              fileUploadEvents: {
                $concatArrays: [
                  recentEvents,
                  [{
                    fileId: updated._id,
                    size: updated.originalSize,
                    completedAt
                  }]
                ]
              }
            }
          }
        ],
        { updatePipeline: true }
      );
    } catch (quotaError) {
      await FileAttachment.updateOne(
        { _id: updated._id, status: 'ready' },
        { $set: { status: 'deleted', deletedAt: new Date(), cleanupPending: true } }
      );
      throw quotaError;
    }

    if (quotaReservation.modifiedCount !== 1) {
      await FileAttachment.updateOne(
        { _id: updated._id, status: 'ready' },
        { $set: { status: 'deleted', deletedAt: new Date(), cleanupPending: true } }
      );
      return res.status(429).json({
        error: 'Limite atteinte : 10 fichiers ou 2 Go maximum sur une période glissante de 5 minutes.',
        retryAfterSeconds: Math.ceil(FILE_UPLOAD_WINDOW_MS / 1000)
      });
    }

    if (updated.originalSize >= LARGE_FILE_THRESHOLD) {
      const cooldownUntil = new Date(completedAt.getTime() + LARGE_FILE_COOLDOWN_MS);

      await User.updateOne(
        {
          _id: req.user.id,
          $or: [
            { largeFileUploadBlockedUntil: null },
            { largeFileUploadBlockedUntil: { $exists: false } },
            { largeFileUploadBlockedUntil: { $lte: completedAt } }
          ]
        },
        [
          {
            $set: {
              largeFileUploadStreak: {
                $add: [{ $ifNull: ['$largeFileUploadStreak', 0] }, 1]
              }
            }
          },
          {
            $set: {
              largeFileUploadBlockedUntil: {
                $cond: [
                  { $gte: ['$largeFileUploadStreak', MAX_CONSECUTIVE_LARGE_FILES] },
                  cooldownUntil,
                  null
                ]
              }
            }
          }
        ],
        { updatePipeline: true }
      );
    } else {
      await User.updateOne(
        { _id: req.user.id },
        { $set: { largeFileUploadStreak: 0, largeFileUploadBlockedUntil: null } }
      );
    }

    res.json({
      fileId: updated._id.toString(),
      status: 'ready',
      chunkCount: updated.chunkCount
    });
  } catch (error) {
    console.error('File finalize error:', error);
    res.status(500).json({ error: 'Impossible de finaliser le fichier.' });
  }
});


router.get('/:fileId/chunks/:index/url', signedUrlRateLimit, async (req, res) => {
  try {
    const { fileId, index } = req.params;

    if (!mongoose.isValidObjectId(fileId) || !/^\d{1,3}$/.test(index)) {
      return res.status(400).json({ error: 'Identifiant de fichier ou index invalide.' });
    }

    const file = await FileAttachment.findOne({
      _id: fileId,
      status: 'ready'
    });

    if (!file) {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }

    const keyPackage = await getAuthorizedFile(file, req.user.id);
    if (!keyPackage) {
      return res.status(403).json({ error: 'Tu n’es pas autorisé à accéder à ce fichier.' });
    }

    const chunk = file.chunks.find(item => item.index === Number(index));
    if (!chunk) {
      return res.status(404).json({ error: 'Morceau de fichier introuvable.' });
    }

    const downloadUrl = await createPresignedDownloadUrl(
      chunk.objectKey,
      300,
      chunk.storageId
    );

    res.json({ downloadUrl, expiresIn: 300 });
  } catch (error) {
    console.error('File chunk download URL error:', error);
    res.status(500).json({ error: 'Impossible de préparer le téléchargement du morceau.' });
  }
});

router.get('/:fileId', signedUrlRateLimit, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ error: 'Identifiant de fichier invalide.' });
    }

    const file = await FileAttachment.findOne({
      _id: fileId,
      status: 'ready'
    });

    if (!file) {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }

    const keyPackage = await getAuthorizedFile(file, req.user.id);

    if (!keyPackage) {
      return res.status(403).json({ error: 'Tu n’es pas autorisé à accéder à ce fichier.' });
    }

    const chunks = [...file.chunks]
      .sort((a, b) => a.index - b.index)
      .map(chunk => ({
        index: chunk.index,
        storageId: chunk.storageId,
        encryptedSize: chunk.encryptedSize,
        iv: chunk.iv,
        sha256: chunk.sha256
      }));

    res.json({
      fileId: file._id.toString(),
      category: file.category,
      encryptedMetadata: file.encryptedMetadata,
      originalSize: file.originalSize,
      chunkSize: file.chunkSize,
      chunkCount: file.chunkCount,
      cryptoVersion: file.cryptoVersion,
      keyPackage: {
        encryptedKey: keyPackage.encryptedKey,
        keyVersion: keyPackage.keyVersion
      },
      senderId: file.sender.toString(),
      senderPublicKey: file.senderPublicKey,
      chunks
    });
  } catch (error) {
    console.error('File download manifest error:', error);
    res.status(500).json({ error: 'Impossible de préparer le téléchargement.' });
  }
});


router.delete('/:fileId', signedUrlRateLimit, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ error: 'Identifiant de fichier invalide.' });
    }

    const result = await deleteMessageAttachments([fileId], req.user.id);

    if (result.stillReferenced > 0) {
      return res.status(409).json({
        error: 'Ce fichier est encore utilisé par un ou plusieurs messages.'
      });
    }

    if (result.deleted === 0 && result.cleanupPending === 0) {
      const existing = await FileAttachment.findOne({
        _id: fileId,
        sender: req.user.id,
        status: 'deleted'
      }).select('_id cleanupPending');

      if (!existing) {
        return res.status(404).json({ error: 'Fichier introuvable ou déjà supprimé.' });
      }
    }

    res.json({
      deleted: result.deleted > 0,
      cleanupPending: result.cleanupPending > 0
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({ error: 'Impossible de supprimer le fichier.' });
  }
});

module.exports = router;
