const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

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

mongoose
  .connect(process.env.MONGO_URI)
  .then(() =>
    console.log('✅ MongoDB connecté')
  )
  .catch(err =>
    console.error(
      '❌ MongoDB error:',
      err
    )
  );

// ─── Shared state ──────────────────────────

const connectedUsers =
  new Map();

app.set('io', io);
app.set(
  'connectedUsers',
  connectedUsers
);

// ─── ROUTES API ────────────────────────────

app.use(
  '/api/auth',
  require('./routes/auth')
);

app.use(
  '/api/friends',
  require('./routes/friends')
);

app.use(
  '/api/admin',
  require('./routes/admin')
);

app.use(
  '/api',
  require('./routes/turn')
);

app.get(
  '/health',
  (req, res) =>
    res.status(200).send('OK')
);

// ─── SOCKET LOGIC ──────────────────────────

const lastMessageTimes =
  new Map();

const Message =
  require('./models/Message');

const User =
  require('./models/User');

io.on(
  'connection',
  (socket) => {
    console.log(
      `🔌 Socket connecté: ${socket.id}`
    );

    // ────────────────────────────────────────
    // AUTHENTIFICATION SOCKET
    // ────────────────────────────────────────

    socket.on(
      'authenticate',
      async (token) => {
        try {
          const decoded =
            jwt.verify(
              token,
              process.env.JWT_SECRET
            );

          socket.userId =
            decoded.id;

          connectedUsers.set(
            decoded.id,
            socket.id
          );

          await User.findByIdAndUpdate(
            decoded.id,
            {
              isOnline: true
            }
          );

          socket.emit(
            'authenticated',
            true
          );

        } catch (err) {
          socket.emit(
            'authenticated',
            false
          );
        }
      }
    );

    // ────────────────────────────────────────
    // ENVOI MESSAGE E2EE
    // ────────────────────────────────────────

    socket.on(
      'sendMessage',
      async ({
        receiverId,
        content
      }) => {
        try {
          if (!socket.userId) {
            return;
          }

          /*
           * IMPORTANT E2EE :
           *
           * "content" doit être le ciphertext
           * produit par encryptMessage() dans
           * Chat.jsx.
           *
           * Le serveur ne reçoit donc jamais
           * le plaintext.
           */

          if (
            !content ||
            typeof content !==
              'string' ||
            !content.trim()
          ) {
            return;
          }

          /*
           * Vérification minimale du format
           * du ciphertext.
           *
           * Le serveur ne le déchiffre pas.
           */

          let encryptedPayload;

          try {
            encryptedPayload =
              JSON.parse(
                content
              );
          } catch {
            return socket.emit(
              'messageError',
              {
                message:
                  'Message chiffré invalide.'
              }
            );
          }

          if (
            !encryptedPayload ||
            encryptedPayload.v !== 1 ||
            typeof encryptedPayload.iv !==
              'string' ||
            typeof encryptedPayload.ct !==
              'string'
          ) {
            return socket.emit(
              'messageError',
              {
                message:
                  'Message chiffré invalide.'
              }
            );
          }

          // ────────────────────────────────
          // ANTI-SPAM
          // ────────────────────────────────

          const now =
            Date.now();

          const last =
            lastMessageTimes.get(
              socket.userId
            ) || 0;

          if (
            now - last <
            1000
          ) {
            return socket.emit(
              'spamWarning',
              {
                message:
                  'Envoie pas si vite !'
              }
            );
          }

          lastMessageTimes.set(
            socket.userId,
            now
          );

          // ────────────────────────────────
          // STOCKAGE
          // ────────────────────────────────

          /*
           * MongoDB reçoit UNIQUEMENT
           * le ciphertext.
           */

          const message =
            await Message.create({
              sender:
                socket.userId,

              receiver:
                receiverId,

              content:
                content.trim(),

              originalContent:
                null,

              encrypted:
                true
            });

          const sender =
            await User.findById(
              socket.userId
            ).select(
              'username ipAlias'
            );

          const messageData = {
            _id:
              message._id.toString(),

            sender:
              socket.userId,

            senderInfo:
              sender,

            receiver:
              receiverId,

            /*
             * C'est le ciphertext.
             * JAMAIS le plaintext.
             */

            content:
              message.content,

            encrypted:
              true,

            createdAt:
              message.createdAt
          };

          // ────────────────────────────────
          // DESTINATAIRE
          // ────────────────────────────────

          const receiverSocket =
            connectedUsers.get(
              receiverId
            );

          if (receiverSocket) {
            io.to(
              receiverSocket
            ).emit(
              'newMessage',
              messageData
            );
          }

          // ────────────────────────────────
          // EXPÉDITEUR
          // ────────────────────────────────

          socket.emit(
            'messageSent',
            messageData
          );

        } catch (err) {
          console.error(
            'sendMessage error:',
            err
          );

          socket.emit(
            'messageError',
            {
              message:
                'Impossible d\'envoyer le message.'
            }
          );
        }
      }
    );

    // ────────────────────────────────────────
    // SIGNALING WEBRTC
    // ────────────────────────────────────────

    socket.on(
      'callUser',
      ({
        receiverId,
        offer
      }) => {
        const receiverSocket =
          connectedUsers.get(
            receiverId
          );

        if (receiverSocket) {
          io.to(
            receiverSocket
          ).emit(
            'incomingCall',
            {
              callerId:
                socket.userId,
              offer
            }
          );
        } else {
          socket.emit(
            'callFailed',
            {
              message:
                'Utilisateur non connecté'
            }
          );
        }
      }
    );

    socket.on(
      'answerCall',
      ({
        callerId,
        answer
      }) => {
        const callerSocket =
          connectedUsers.get(
            callerId
          );

        if (callerSocket) {
          io.to(
            callerSocket
          ).emit(
            'callAnswered',
            {
              answer
            }
          );
        }
      }
    );

    socket.on(
      'iceCandidate',
      ({
        receiverId,
        candidate
      }) => {
        const receiverSocket =
          connectedUsers.get(
            receiverId
          );

        if (receiverSocket) {
          io.to(
            receiverSocket
          ).emit(
            'iceCandidate',
            {
              candidate
            }
          );
        }
      }
    );

    socket.on(
      'endCall',
      ({
        receiverId
      }) => {
        const receiverSocket =
          connectedUsers.get(
            receiverId
          );

        if (receiverSocket) {
          io.to(
            receiverSocket
          ).emit(
            'callEnded'
          );
        }
      }
    );

    // ────────────────────────────────────────
    // DISCONNECT
    // ────────────────────────────────────────

    socket.on(
      'disconnect',
      async () => {
        if (socket.userId) {
          connectedUsers.delete(
            socket.userId
          );

          lastMessageTimes.delete(
            socket.userId
          );

          await User.findByIdAndUpdate(
            socket.userId,
            {
              isOnline: false
            }
          );
        }
      }
    );
  }
);

// ─── SERVIR LE FRONTEND REACT ──────────────────────────

app.use(
  express.static(
    path.join(
      __dirname,
      'dist'
    )
  )
);

app.get(
  '/sitemap.xml',
  (req, res) => {
    res.type(
      'application/xml'
    );

    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'sitemap.xml'
      )
    );
  }
);

app.get(
  /^(?!\/api).*/,
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'index.html'
      )
    );
  }
);

// ─── START SERVER ──────────────────────────

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `🚀 Serveur lancé sur le port ${PORT}`
    );
  }
);