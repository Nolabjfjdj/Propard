const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error(err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/friends', require('./routes/friends'));

const connectedUsers = new Map();

const Message = require('./models/Message');
const User = require('./models/User');

io.on('connection', (socket) => {

  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.userId = decoded.id;
      connectedUsers.set(decoded.id, socket.id);

      await User.findByIdAndUpdate(decoded.id, { isOnline: true });

      socket.emit('authenticated', true);

    } catch (e) {
      socket.emit('authenticated', false);
    }
  });

  socket.on('sendMessage', async ({ receiverId, content }) => {
    try {
      if (!socket.userId) return;

      const message = await Message.create({
        sender: socket.userId,
        receiver: receiverId,
        content: content.trim()
      });

      const sender = await User.findById(socket.userId)
        .select('username ipAlias');

      const messageData = {
        _id: message._id.toString(),
        sender: socket.userId, // 🔥 IMPORTANT (string simple)
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
      console.error(err);
    }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
    }
  });
});

server.listen(process.env.PORT || 3000);
