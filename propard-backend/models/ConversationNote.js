const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const conversationNoteSchema = new mongoose.Schema({
  scope: { type: String, enum: ['private', 'group'], required: true },
  conversationKey: { type: String, required: true, maxlength: 80 },
  encryptedContent: { type: String, required: true, maxlength: 20000 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedAt: { type: Date, default: Date.now }
});

conversationNoteSchema.index({ scope: 1, conversationKey: 1 }, { unique: true });

module.exports = registerModel('ConversationNote', conversationNoteSchema);
