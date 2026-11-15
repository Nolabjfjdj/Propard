const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');
const { encryptText, decryptText, isEncrypted } = require('../services/aiConversationCrypto');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 24000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'Nouvelle conversation', trim: true, maxlength: 80 },
  messages: { type: [messageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now, index: true }
});

conversationSchema.index({ userId: 1, updatedAt: -1 });

conversationSchema.post('init', function () {
  let needsEncryption = false;
  for (const message of this.messages || []) {
    if (!isEncrypted(message.content)) needsEncryption = true;
    else message.content = decryptText(message.content);
  }
  Object.defineProperty(this, '_aiMessagesNeedEncryption', {
    value: needsEncryption,
    writable: true,
    configurable: true,
    enumerable: false
  });
});

conversationSchema.pre('save', function () {
  for (const message of this.messages || []) {
    if (!isEncrypted(message.content)) message.content = encryptText(message.content);
  }
});

conversationSchema.post('save', function () {
  for (const message of this.messages || []) {
    if (isEncrypted(message.content)) message.content = decryptText(message.content);
  }
  this._aiMessagesNeedEncryption = false;
});

conversationSchema.statics.migrateUserConversations = async function (userId) {
  const conversations = await this.find({ userId });
  let migrated = 0;
  for (const conversation of conversations) {
    if (conversation._aiMessagesNeedEncryption) {
      await conversation.save();
      migrated += 1;
    }
  }
  return migrated;
};

module.exports = registerModel('AIConversation', conversationSchema);
