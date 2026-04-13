const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ─── SOCKET.IO ─────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ─── MIDDLEWARES ───────────────────────────
app.use(cors());
app.use(express.json());

// ─── MONGO DB ──────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── ROUTES API ────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/friends', require('./routes/friends'));

// 🔥 UPTIME ROBOT FIX
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API online 🚀'
  });
});

// 🔥 OPTION RECOMMANDÉE
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ─── SOCKET LOGIC ─────────────────────────
const connectedUsers = new Map();

const Message = require('./models/Message');
const User = require('./models/User');

io.on('connection', (socket) => {
  console.log(`🔌 Socket connecté: ${socket.id}`);

  // AUTH SOCKET
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.userId = decoded.id;
      connectedUsers.set(decoded.id, socket.id);

      await User.findByIdAndUpdate(decoded.id, { isOnline: true });

      socket.emit('authenticated', true);

    } catch (err) {
      socket.emit('authenticated', false);
    }
  });

  // SEND MESSAGE
  socket.on('sendMessage', async ({ receiverId, content }) => {
    try {
      if (!socket.userId) return;

      if (!content || !content.trim()) return;

      const message = await Message.create({
        sender: socket.userId,
        receiver: receiverId,
        content: content.trim()
      });

      const sender = await User.findById(socket.userId)
        .select('username ipAlias');

      const messageData = {
        _id: message._id.toString(),

        // IMPORTANT: toujours string pour éviter bug front
        sender: socket.userId,

        senderInfo: sender,

        receiver: receiverId,
        content: message.content,
        createdAt: message.createdAt
      };

      const receiverSocket = connectedUsers.get(receiverId);

      if (receiverSocket) {
        io.to(receiverSocket).emit('newMessage', messageData);
      }

      socket.emit('messageSent', messageData);

    } catch (err) {
      console.error('sendMessage error:', err);
    }
  });

  // DISCONNECT
  socket.on('disconnect', async () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
    }
  });
});

// ─── START SERVER ──────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
