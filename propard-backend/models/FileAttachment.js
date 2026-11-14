const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const chunkSchema = new mongoose.Schema({
  index: { type: Number, required: true, min: 0 },
  storageId: { type: Number, required: true, min: 1, max: 100, default: 1 },
  objectKey: { type: String, required: true, maxlength: 1024 },
  encryptedSize: { type: Number, required: true, min: 17 },
  iv: { type: String, required: true, match: /^[A-Za-z0-9+/]{16}$/ },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  provider: { type: String, enum: ['filebase'], default: 'filebase', required: true },
  uploadedAt: { type: Date, default: null }
}, { _id: false });

const fileKeyPackageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  encryptedKey: { type: String, required: true, maxlength: 10000 },
  keyVersion: { type: Number, required: true, min: 1 }
}, { _id: false });

const fileAttachmentSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scope: { type: String, enum: ['private', 'group'], required: true },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null,
    index: true
  },
  groupKeyVersion: { type: Number, default: null, min: 1 },
  storageId: { type: Number, required: true, min: 1, max: 100, default: 1 },
  senderPublicKey: { type: String, required: true, maxlength: 2000 },
  batchId: { type: String, required: true, minlength: 36, maxlength: 36, match: /^[a-f0-9-]{36}$/i, index: true },
  encryptedMetadata: { type: String, required: true, maxlength: 20000 },
  cryptoVersion: { type: Number, enum: [1], default: 1, required: true },
  originalSize: { type: Number, required: true, min: 1 },
  chunkSize: { type: Number, required: true, min: 1 },
  chunkCount: { type: Number, required: true, min: 1, max: 640 },
  chunks: {
    type: [chunkSchema],
    default: [],
    validate: {
      validator: chunks => Array.isArray(chunks) && chunks.length <= 640,
      message: 'Trop de morceaux pour ce fichier.'
    }
  },
  keyPackages: {
    type: [fileKeyPackageSchema],
    default: [],
    validate: {
      validator: packages => Array.isArray(packages) && packages.length <= 50,
      message: 'Trop de destinataires pour ce fichier.'
    }
  },
  uploadExpiresAt: { type: Date, default: null, index: true },
  status: {
    type: String,
    enum: ['uploading', 'ready', 'deleted', 'failed'],
    default: 'uploading',
    index: true
  },
  createdAt: { type: Date, default: Date.now, immutable: true },
  completedAt: { type: Date, default: null },
  attachedAt: { type: Date, default: null, index: true },
  deletedAt: { type: Date, default: null },
  cleanupPending: { type: Boolean, default: false, index: true }
});

fileAttachmentSchema.pre('validate', function validateFileConversation(next) {
  const isPrivate = this.scope === 'private';
  const hasRecipient = this.recipient != null;
  const hasGroup = this.group != null;

  if (isPrivate && (!hasRecipient || hasGroup || this.groupKeyVersion != null)) {
    return next(new Error('Conversation privée de fichier invalide.'));
  }

  if (!isPrivate && (hasRecipient || !hasGroup || !Number.isSafeInteger(this.groupKeyVersion) || this.groupKeyVersion < 1)) {
    return next(new Error('Conversation de groupe de fichier invalide.'));
  }

  if (this.chunks.length > this.chunkCount) {
    return next(new Error('Le manifeste contient trop de morceaux.'));
  }

  const indexes = new Set();
  const storedObjects = new Set();

  for (const chunk of this.chunks) {
    const storedObject = `${chunk.storageId}:${chunk.objectKey}`;

    if (
      chunk.index >= this.chunkCount ||
      indexes.has(chunk.index) ||
      storedObjects.has(storedObject)
    ) {
      return next(new Error('Morceau de fichier dupliqué.'));
    }

    indexes.add(chunk.index);
    storedObjects.add(storedObject);
  }

  if (this.status === 'ready' && this.chunks.length !== this.chunkCount) {
    return next(new Error('Le manifeste du fichier est incomplet.'));
  }

  const packageUsers = new Set();
  for (const item of this.keyPackages) {
    const userId = item.userId.toString();
    if (packageUsers.has(userId)) {
      return next(new Error('Paquet de clé de fichier dupliqué.'));
    }
    packageUsers.add(userId);
  }

  next();
});

fileAttachmentSchema.index({ sender: 1, createdAt: -1 });
fileAttachmentSchema.index({ recipient: 1, status: 1, createdAt: -1 });
fileAttachmentSchema.index({ group: 1, status: 1, createdAt: -1 });

module.exports = registerModel('FileAttachment', fileAttachmentSchema);
