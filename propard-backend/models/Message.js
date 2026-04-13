const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Qui a envoyé le message
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // À qui (conversation entre deux personnes)
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Le contenu du message
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },

  // Lu ou non
  read: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
