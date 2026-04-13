const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Le pseudo choisi par l'utilisateur
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 16
  },

  // Le mot de passe (sera chiffré)
  password: {
    type: String,
    required: true
  },

  // L'IP alias générée automatiquement (ex: "192.84.231.107")
  ipAlias: {
    type: String,
    required: true,
    unique: true
  },

  // Liste des amis
  friends: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      nickname: { type: String, default: null } // surnom optionnel
    }
  ],

  // Demandes d'amis reçues (en attente)
  friendRequests: [
    {
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }
  ],

  // Statut en ligne
  isOnline: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
