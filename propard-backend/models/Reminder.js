const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const reminderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  note: { type: String, default: null, trim: true, maxlength: 240 },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'sent', 'cancelled', 'failed'], default: 'pending', index: true },
  sentAt: { type: Date, default: null },
  claimedAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0, min: 0, max: 20 },
  createdAt: { type: Date, default: Date.now }
});

reminderSchema.index({ user: 1, status: 1, dueAt: 1 });

module.exports = registerModel('Reminder', reminderSchema);
