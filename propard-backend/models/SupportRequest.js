const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const supportRequestSchema = new mongoose.Schema({
  kind: { type: String, enum: ['password_reset', 'support'], required: true, index: true },
  username: { type: String, required: true, trim: true, maxlength: 20 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  message: { type: String, required: true, trim: true, minlength: 20, maxlength: 1500 },
  publicReference: { type: String, unique: true, sparse: true, index: true },
  accessTokenHash: { type: String, select: false },
  staffReply: { type: String, default: '', maxlength: 1500 },
  staffReplyAt: { type: Date, default: null },
  recoveryCodeEncrypted: { type: String, select: false, default: null },
  recoveryCodeExpiresAt: { type: Date, default: null },
  status: { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

supportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = registerModel('SupportRequest', supportRequestSchema);
