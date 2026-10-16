const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const staffAuditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorUsername: { type: String, default: null, maxlength: 32 },
  action: { type: String, required: true, maxlength: 100, index: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  targetUsername: { type: String, default: null, maxlength: 32 },
  targetReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null, index: true },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: null, maxlength: 128 },
  userAgent: { type: String, default: null, maxlength: 512 },
  createdAt: { type: Date, default: Date.now, index: true }
});

staffAuditLogSchema.index({ actor: 1, createdAt: -1 });
staffAuditLogSchema.index({ targetUser: 1, createdAt: -1 });

module.exports = registerModel('StaffAuditLog', staffAuditLogSchema);
