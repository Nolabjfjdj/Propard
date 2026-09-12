const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 20000
  },
  encrypted: {
    type: Boolean,
    default: true
  },
  edited: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

groupMessageSchema.index({ group: 1, createdAt: -1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
