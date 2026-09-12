const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    required: true,
    index: true
  },

  content: {
    type: String,
    required: true,
    maxlength: 5000
  },

  reason: {
    type: String,
    default: null,
    maxlength: 500
  },

  messageCreatedAt: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: ['new', 'processed', 'rejected'],
    default: 'new',
    index: true
  },

  processedAt: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Report', reportSchema);