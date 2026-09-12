const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const mongoose=require('mongoose');
const cors=require('cors');
const jwt=require('jsonwebtoken');
const path=require('path');
require('dotenv').config();

const app=express();
const server=http.createServer(app);

// Nécessaire pour que req.ip reflète la vraie IP du client derrière le
// proxy de Render — sans ça, le rate limiting par IP verrait toujours
// la même adresse interne et s'appliquerait globalement au lieu de par
// utilisateur.
app.set('trust proxy',1);

const io=new Server(server,{
  cors:{
    origin:process.env.FRONTEND_ORIGIN || '*',
    methods:['GET','POST']
  }
});

app.use(cors({
  origin:process.env.FRONTEND_ORIGIN || '*'
}));

app.use(express.json());

// Headers de sécurité de base.
app.use((req,res,next)=>{
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https: wss: turn: turns: stun:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  next();
});

mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log('✅ MongoDB connecté'))
  .catch(e=>console.error(
    '❌ MongoDB error:',
    e
  ));

// userId -> Set<socketId>
const connectedUsers=new Map();

function addConnection(
  userId,
  socketId
){
  if(
    !connectedUsers.has(userId)
  ){
    connectedUsers.set(
      userId,
      new Set()
    );
  }

  connectedUsers
    .get(userId)
    .add(socketId);
}

function removeConnection(
  userId,
  socketId
){
  const set =
    connectedUsers.get(userId);

  if(!set) return false;

  set.delete(socketId);

  if(set.size===0){
    connectedUsers.delete(userId);

    return true;
  }

  return false;
}

function emitToUser(
  ioInstance,
  userId,
  event,
  payload
){
  const set =
    connectedUsers.get(userId);

  if(
    !set ||
    set.size===0
  ){
    return false;
  }

  for(
    const socketId of set
  ){
    ioInstance
      .to(socketId)
      .emit(
        event,
        payload
      );
  }

  return true;
}

app.set(
  'io',
  io
);

app.set(
  'connectedUsers',
  connectedUsers
);

app.set(
  'emitToUser',
  emitToUser
);

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
  '/api/admin/reports',
  require('./routes/reportsAdmin')
);

app.use(
  '/api/announcements',
  require('./routes/announcements')
);

app.use(
  '/api',
  require('./routes/turn')
);

app.use(
  '/api/reports',
  require('./routes/reports')
);

app.get(
  '/health',
  (req,res)=>
    res.status(200).send('OK')
);

const lastMessageTimes =
  new Map();

const Message =
  require('./models/Message');

const User =
  require('./models/User');

async function areFriends(
  userId,
  friendId
){
  const user =
    await User
      .findById(userId)
      .select('friends');

  return !!user &&
    user.friends.some(
      f =>
        f.userId.toString() ===
        friendId.toString()
    );
}

io.on(
  'connection',
  socket => {

    console.log(
      `🔌 Socket connecté: ${socket.id}`
    );

    // ─────────────────────────────────────
    // AUTHENTIFICATION SOCKET
    // ─────────────────────────────────────

    socket.on(
      'authenticate',
      async token => {
        try{
          const decoded =
            jwt.verify(
              token,
              process.env.JWT_SECRET
            );

          socket.userId =
            decoded.id;

          const wasOffline =
            !connectedUsers.has(
              decoded.id
            );

          addConnection(
            decoded.id,
            socket.id
          );

          if(wasOffline){
            await User.findByIdAndUpdate(
              decoded.id,
              {
                isOnline:true
              }
            );
          }

          socket.emit(
            'authenticated',
            true
          );

        }catch{
          socket.emit(
            'authenticated',
            false
          );
        }
      }
    );

    // ─────────────────────────────────────
    // MESSAGES
    // ─────────────────────────────────────

    socket.on(
      'sendMessage',
      async ({
        receiverId,
        content
      })=>{
        try{
          if(!socket.userId){
            return;
          }

          if(
            !content ||
            typeof content !==
              'string' ||
            !content.trim()
          ){
            return;
          }

          if(
            !mongoose.isValidObjectId(
              receiverId
            ) ||
            !(await areFriends(
              socket.userId,
              receiverId
            ))
          ){
            return socket.emit(
              'messageError',
              {
                message:
                  'Destinataire invalide.'
              }
            );
          }

          let p;

          try{
            p=JSON.parse(content);
          }catch{
            return socket.emit(
              'messageError',
              {
                message:
                  'Message chiffré invalide.'
              }
            );
          }

          if(
            !p ||
            p.v!==1 ||
            typeof p.iv!=='string' ||
            typeof p.ct!=='string'
          ){
            return socket.emit(
              'messageError',
              {
                message:
                  'Message chiffré invalide.'
              }
            );
          }

          const now=Date.now();

          const last =
            lastMessageTimes.get(
              socket.userId
            ) || 0;

          if(
            now-last<1000
          ){
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
            await User
              .findById(
                socket.userId
              )
              .select(
                'username ipAlias'
              );

          const messageData={
            _id:
              message._id.toString(),

            sender:
              socket.userId,

            senderInfo:
              sender,

            receiver:
              receiverId,

            content:
              message.content,

            encrypted:
              true,

            createdAt:
              message.createdAt
          };

          emitToUser(
            io,
            receiverId,
            'newMessage',
            messageData
          );

          socket.emit(
            'messageSent',
            messageData
          );

        }catch(e){
          console.error(
            'sendMessage error:',
            e
          );

          socket.emit(
            'messageError',
            {
              message:
                'Impossible d’envoyer le message.'
            }
          );
        }
      }
    );

    // ─────────────────────────────────────
    // WEBRTC
    // ─────────────────────────────────────

    socket.on(
      'callUser',
      async ({
        receiverId,
        offer
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            receiverId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            receiverId
          ))
        ){
          return socket.emit(
            'callFailed',
            {
              message:
                'Utilisateur non autorisé'
            }
          );
        }

        const delivered =
          emitToUser(
            io,
            receiverId,
            'incomingCall',
            {
              callerId:
                socket.userId,

              offer
            }
          );

        if(!delivered){
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

    // ─────────────────────────────────────
    // RÉPONSE À L'APPEL INITIAL
    // ─────────────────────────────────────

    socket.on(
      'answerCall',
      async ({
        callerId,
        answer
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            callerId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            callerId
          ))
        ){
          return;
        }

        emitToUser(
          io,
          callerId,
          'callAnswered',
          {
            answer
          }
        );
      }
    );

    // ─────────────────────────────────────
    // ICE CANDIDATES
    // ─────────────────────────────────────

    socket.on(
      'iceCandidate',
      async ({
        receiverId,
        candidate
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            receiverId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            receiverId
          ))
        ){
          return;
        }

        emitToUser(
          io,
          receiverId,
          'iceCandidate',
          {
            candidate
          }
        );
      }
    );

    // ─────────────────────────────────────
    // ICE RESTART
    //
    // Utilisé lorsque l'appelant doit changer
    // de chemin ICE/TURN sans raccrocher.
    // ─────────────────────────────────────

    socket.on(
      'iceRestartOffer',
      async ({
        receiverId,
        offer
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            receiverId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            receiverId
          ))
        ){
          return;
        }

        emitToUser(
          io,
          receiverId,
          'iceRestartOffer',
          {
            callerId:
              socket.userId,

            offer
          }
        );
      }
    );

    // ─────────────────────────────────────
    // RÉPONSE À L'ICE RESTART
    // ─────────────────────────────────────

    socket.on(
      'iceRestartAnswer',
      async ({
        callerId,
        answer
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            callerId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            callerId
          ))
        ){
          return;
        }

        emitToUser(
          io,
          callerId,
          'iceRestartAnswer',
          {
            answer
          }
        );
      }
    );

    // ─────────────────────────────────────
    // FIN D'APPEL
    // ─────────────────────────────────────

    socket.on(
      'endCall',
      async ({
        receiverId
      })=>{
        if(!socket.userId){
          return;
        }

        if(
          !mongoose.isValidObjectId(
            receiverId
          )
        ){
          return;
        }

        if(
          !(await areFriends(
            socket.userId,
            receiverId
          ))
        ){
          return;
        }

        emitToUser(
          io,
          receiverId,
          'callEnded'
        );
      }
    );

    // ─────────────────────────────────────
    // DÉCONNEXION
    // ─────────────────────────────────────

    socket.on(
      'disconnect',
      async ()=>{
        if(socket.userId){

          const becameOffline =
            removeConnection(
              socket.userId,
              socket.id
            );

          lastMessageTimes.delete(
            socket.userId
          );

          if(becameOffline){
            await User.findByIdAndUpdate(
              socket.userId,
              {
                isOnline:false
              }
            );
          }
        }
      }
    );
  }
);

// ─────────────────────────────────────────
// FICHIERS STATIQUES
// ─────────────────────────────────────────

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
  (req,res)=>{
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
  (req,res)=>
    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'index.html'
      )
    )
);

// ─────────────────────────────────────────
// SERVEUR
// ─────────────────────────────────────────

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  '0.0.0.0',
  ()=>console.log(
    `🚀 Serveur lancé sur le port ${PORT}`
  )
);