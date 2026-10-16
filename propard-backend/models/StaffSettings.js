const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const staffSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global', index: true },
  passwordResetNotifications: { type: Boolean, default: true },
  supportNotifications: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

module.exports = registerModel('StaffSettings', staffSettingsSchema);
