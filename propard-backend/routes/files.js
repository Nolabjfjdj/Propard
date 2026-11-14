const express = require('express');
const mongoose = require('mongoose');
const { randomBytes } = require('crypto');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const User = require('../models/User');
const Group = require('../models/Group');
const FileAttachment = require('../models/FileAttachment');
const {
  selectFilebaseStorageId,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  headStoredObject,
  deleteStoredObject
} = require('../services/filebase');

const CHUNK_SIZE = 8 * 1024 * 1024;
const IMAGE_MAX_SIZE = 50 * 1024 * 1024;
const VIDEO_MAX_SIZE = 1024 * 1024 * 1024;
const DOCUMENT_MAX_SIZE = 250 * 1024 * 1024;
const MAX_FILE_SIZE = VIDEO_MAX_SIZE;
const MAX_CHUNKS = 640;
const MAX_KEY_PACKAGES = 50;

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
    return file.keyPackages.find(item => item.userId.toString() === currentUserId) || null;
  }

  if (file.scope === 'group') {
    const group = await Group.findOne({
      _id: file.group,
      'members.userId': userId
    }).select('members keyVersion');

    if (!group) return null;

    return file.keyPackages.find(item => item.userId.toString() === currentUserId) || null;
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
      keyPackages
    } = req.body || {};

    if (
      !['private', 'group'].includes(scope) ||
      !['image', 'video', 'document'].includes(category) ||
      !Number.isSafeInteger(originalSize) ||
      originalSize < 1 ||
      originalSize > MAX_FILE_SIZE ||
      chunkSize !== CHUNK_SIZE ||
      !Number.isSafeInteger(chunkCount) ||
      chunkCount !== Math.ceil(originalSize / CHUNK_SIZE) ||
      chunkCount < 1 ||
      chunkCount > MAX_CHUNKS ||
      typeof encryptedMetadata !== 'string' ||
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

    const storageId = selectFilebaseStorageId();

    const file = await FileAttachment.create({
      sender: req.user.id,
      scope,
      recipient,
      group: group?._id || null,
      groupKeyVersion: scope === 'group' ? currentKeyVersion : null,
      storageId,
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

    const chunks = [...file.chunks].sort((a, b) => a.index - b.index);
    const signedChunks = [];

    for (const chunk of chunks) {
      signedChunks.push({
        index: chunk.index,
        storageId: chunk.storageId,
        encryptedSize: chunk.encryptedSize,
        iv: chunk.iv,
        sha256: chunk.sha256,
        downloadUrl: await createPresignedDownloadUrl(
          chunk.objectKey,
          300,
          chunk.storageId
        )
      });
    }

    res.json({
      fileId: file._id.toString(),
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
      chunks: signedChunks
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

    const file = await FileAttachment.findOneAndUpdate(
      {
        _id: fileId,
        sender: req.user.id,
        status: { $in: ['uploading', 'ready', 'failed'] }
      },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date()
        }
      },
      { new: true }
    );

    if (!file) {
      return res.status(404).json({ error: 'Fichier introuvable ou déjà supprimé.' });
    }

    let cleanupPending = false;

    for (const chunk of file.chunks) {
      try {
        await deleteStoredObject(chunk.objectKey, chunk.storageId);
      } catch (error) {
        cleanupPending = true;
        console.error('File object cleanup error:', error);
      }
    }

    res.json({
      deleted: true,
      cleanupPending
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({ error: 'Impossible de supprimer le fichier.' });
  }
});

module.exports = router;
