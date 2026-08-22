const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Le pseudo affiché partout (login normal, ou "supprimé_xxxxxx" pendant
  // une anonymisation en cours).
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
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

  // Clé publique ECDH (JWK, format JSON) pour le chiffrement de bout en
  // bout des messages. La clé privée correspondante ne quitte jamais le
  // navigateur de l'utilisateur.
  publicKey: {
    type: String,
    default: null
  },

  // Pseudo réel, caché, sauvegardé le temps d'une anonymisation en cours.
  // Permet à l'utilisateur de se reconnecter avec son pseudo/mot de passe
  // habituels pendant 30 jours pour annuler la suppression. Effacé
  // définitivement à l'annulation ou à la finalisation après 30 jours.
  realUsername: {
    type: String,
    default: null
  },

  // Date à laquelle le compte a été anonymisé. Si définie et vieille de
  // moins de 30 jours, le compte est restaurable. Passé ce délai, un
  // nettoyage automatique finalise l'anonymisation (irréversible).
  pendingDeletionAt: {
    type: Date,
    default: null
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
