const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ─── Configuration Socket.io ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*', // En prod, remplace par l'URL de ton frontend
    methods: ['GET', 'POST']
  }
});

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Connexion MongoDB ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/friends', require('./routes/friends'));

// Route de test pour vérifier que le serveur tourne
app.get('/', (req, res) => {
  res.json({ message: '🚀 IPLink API en ligne !' });
});

// ─── Socket.io — Temps réel ───────────────────────────────────────────────────

// Map pour tracker les utilisateurs connectés : userId → socketId
const connectedUsers = new Map();

const Message = require('./models/Message');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

io.on('connection', (socket) => {
  console.log(`🔌 Nouvelle connexion socket: ${socket.id}`);

  // ─── Authentification du socket ─────────────────────────────────────────
  // Le client doit envoyer son token JWT dès la connexion
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      connectedUsers.set(decoded.id, socket.id);

      // Met le statut en ligne dans MongoDB
      await User.findByIdAndUpdate(decoded.id, { isOnline: true });

      socket.emit('authenticated', { success: true });
      console.log(`👤 Utilisateur authentifié: ${decoded.id}`);

    } catch (err) {
      socket.emit('authenticated', { success: false, error: 'Token invalide' });
    }
  });

  // ─── Envoi d'un message ──────────────────────────────────────────────────
  socket.on('sendMessage', async (data) => {
    try {
      const { receiverId, content } = data;

      if (!socket.userId) {
        return socket.emit('error', { message: 'Non authentifié' });
      }

      if (!content || content.trim() === '') {
        return socket.emit('error', { message: 'Message vide' });
      }

      // Sauvegarde le message en base de données
      const message = new Message({
        sender: socket.userId,
        receiver: receiverId,
        content: content.trim()
      });
      await message.save();

      // Récupère les infos de l'expéditeur pour les envoyer avec le message
      const senderInfo = await User.findById(socket.userId).select('username ipAlias');

      const messageData = {
        _id: message._id,
        sender: senderInfo,
        receiver: receiverId,
        content: message.content,
        createdAt: message.createdAt
      };

      // Envoie le message au destinataire (s'il est connecté)
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('newMessage', messageData);
      }

      // Confirme à l'expéditeur que le message a été envoyé
      socket.emit('messageSent', messageData);

    } catch (err) {
      console.error(err);
      socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
    }
  });

  // ─── Déconnexion ─────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
      console.log(`👋 Utilisateur déconnecté: ${socket.userId}`);
    }
  });
});

// ─── Démarrage du serveur ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});