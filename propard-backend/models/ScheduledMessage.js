const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const scheduledMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  content: { type: String, required: true, maxlength: 100000 },
  keyVersion: { type: Number, default: null, min: 1 },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'sent', 'cancelled', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0, max: 10 },
  claimedAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: Date.now },
  deliveredMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now }
});

scheduledMessageSchema.index({ dueAt: 1, status: 1, nextAttemptAt: 1 });
scheduledMessageSchema.index({ sender: 1, status: 1, dueAt: 1 });

module.exports = registerModel('ScheduledMessage', scheduledMessageSchema);
