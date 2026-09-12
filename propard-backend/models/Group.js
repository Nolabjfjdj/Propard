const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastReadAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const keyPackageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    required: true,
    min: 1
  },
  encryptedKey: {
    type: String,
    required: true,
    maxlength: 10000
  }
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50
  },
  avatar: {
    type: String,
    default: null,
    maxlength: 1000000
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: {
    type: [memberSchema],
    validate: v => Array.isArray(v) && v.length > 0
  },
  keyVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  keyPackages: {
    type: [keyPackageSchema],
    default: []
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

groupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Group', groupSchema);
