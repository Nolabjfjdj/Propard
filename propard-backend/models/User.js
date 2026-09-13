const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },

  displayName: {
    type: String,
    default: null,
    trim: true,
    maxlength: 32
  },

  avatar: {
    type: String,
    default: null
  },

  password: {
    type: String,
    required: true
  },

  ipAlias: {
    type: String,
    required: true,
    unique: true
  },

  publicKey: {
    type: String,
    default: null
  },

  /*
   * Sauvegarde de la clé privée E2EE chiffrée côté client.
   * Le serveur ne reçoit jamais le mot de passe ni la clé privée
   * en clair.
   */
  e2eeKeyBackup: {
    version: {
      type: Number,
      default: null
    },
    iterations: {
      type: Number,
      default: null
    },
    salt: {
      type: String,
      default: null,
      maxlength: 100
    },
    iv: {
      type: String,
      default: null,
      maxlength: 100
    },
    ciphertext: {
      type: String,
      default: null,
      maxlength: 20000
    },
    updatedAt: {
      type: Date,
      default: null
    }
  },

  realUsername: {
    type: String,
    default: null
  },

  pendingDeletionAt: {
    type: Date,
    default: null
  },

  friends: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      nickname: {
        type: String,
        default: null,
        maxlength: 32
      }
    }
  ],

  friendRequests: [
    {
      from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  blockedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],

  isOnline: {
    type: Boolean,
    default: false
  },

  acceptedAnnouncements: [
    {
      announcementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Announcement'
      },
      acceptedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);