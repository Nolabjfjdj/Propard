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
// proxy de Render — sans ça, le rate limiting par IP verrait toujours la
// même adresse interne et s'appliquerait globalement au lieu de par
// utilisateur.
app.set('trust proxy', 1);

const io=new Server(server,{
  cors:{
    origin: process.env.FRONTEND_ORIGIN || '*',
    methods:['GET','POST']
  }
});

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

// Headers de sécurité de base. style-src autorise 'unsafe-inline' car
// toute l'interface actuelle utilise des styles React inline — les
// retirer casserait le rendu. connect-src reste large (https/wss/turn/
// stun) pour ne pas casser la connexion au fournisseur TURN dont le
// domaine exact peut varier ; à resserrer plus tard si besoin.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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
  .catch(e=>console.error('❌ MongoDB error:',e));

// userId -> Set<socketId>. Permet plusieurs connexions simultanées
// (plusieurs onglets, plusieurs appareils) sans se marquer offline tant
// qu'il reste au moins un socket actif, et sans qu'une nouvelle connexion
// n'écrase/perde les précédentes.
const connectedUsers=new Map();

function addConnection(userId, socketId) {
  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socketId);
}

function removeConnection(userId, socketId) {
  const set = connectedUsers.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    connectedUsers.delete(userId);
    return true; // dernier socket de cet utilisateur : il devient offline
  }
  return false;
}

function emitToUser(ioInstance, userId, event, payload) {
  const set = connectedUsers.get(userId);
  if (!set || set.size === 0) return false;
  for (const socketId of set) {
    ioInstance.to(socketId).emit(event, payload);
  }
  return true;
}

app.set('io',io);
app.set('connectedUsers',connectedUsers);
app.set('emitToUser', emitToUser);

app.use('/api/auth',require('./routes/auth'));
app.use('/api/friends',require('./routes/friends'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/announcements',require('./routes/announcements'));
app.use('/api',require('./routes/turn'));
app.use('/api/reports',require('./routes/reports'));

app.get('/health',(req,res)=>res.status(200).send('OK'));

const lastMessageTimes=new Map();

const Message=require('./models/Message');
const User=require('./models/User');

async function areFriends(userId,friendId){
  const user=await User.findById(userId).select('friends');
  return !!user&&user.friends.some(
    f=>f.userId.toString()===friendId.toString()
  );
}

io.on('connection',socket=>{
  console.log(`🔌 Socket connecté: ${socket.id}`);

  socket.on('authenticate',async token=>{
    try{
      const decoded=jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      socket.userId=decoded.id;

      const wasOffline = !connectedUsers.has(decoded.id);
      addConnection(decoded.id, socket.id);

      // On ne réécrit isOnline que si c'est la première connexion de cet
      // utilisateur — inutile de le refaire pour chaque onglet
      // supplémentaire.
      if (wasOffline) {
        await User.findByIdAndUpdate(
          decoded.id,
          {isOnline:true}
        );
      }

      socket.emit('authenticated',true);

    }catch{
      socket.emit('authenticated',false);
    }
  });

  socket.on('sendMessage',async({receiverId,content})=>{
    try{
      if(!socket.userId)return;

      if(
        !content ||
        typeof content!=='string' ||
        !content.trim()
      )return;

      if(
        !mongoose.isValidObjectId(receiverId) ||
        !(await areFriends(socket.userId,receiverId))
      ){
        return socket.emit(
          'messageError',
          {message:'Destinataire invalide.'}
        );
      }

      let p;

      try{
        p=JSON.parse(content);
      }catch{
        return socket.emit(
          'messageError',
          {message:'Message chiffré invalide.'}
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
          {message:'Message chiffré invalide.'}
        );
      }

      const now=Date.now();
      const last=lastMessageTimes.get(socket.userId)||0;

      if(now-last<1000){
        return socket.emit(
          'spamWarning',
          {message:'Envoie pas si vite !'}
        );
      }

      lastMessageTimes.set(
        socket.userId,
        now
      );

      const message=await Message.create({
        sender:socket.userId,
        receiver:receiverId,
        content:content.trim(),
        originalContent:null,
        encrypted:true
      });

      const sender=await User.findById(
        socket.userId
      ).select(
        'username ipAlias'
      );

      const messageData={
        _id:message._id.toString(),
        sender:socket.userId,
        senderInfo:sender,
        receiver:receiverId,
        content:message.content,
        encrypted:true,
        createdAt:message.createdAt
      };

      emitToUser(io, receiverId, 'newMessage', messageData);

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
          message:'Impossible d’envoyer le message.'
        }
      );
    }
  });

  // ─── Événements WebRTC : authentification + vérification d'amitié ───────
  // Avant, ces événements faisaient confiance au receiverId/callerId
  // fourni par le client sans vérifier ni qui il était, ni s'il avait le
  // droit de contacter cette personne. On applique désormais les mêmes
  // règles que pour les messages : utilisateur authentifié + amis avec
  // la cible, en réutilisant areFriends() déjà utilisé pour la
  // messagerie (pas de deuxième logique d'amitié).

  socket.on('callUser',async ({receiverId,offer})=>{
    if(!socket.userId) return;
    if(!mongoose.isValidObjectId(receiverId)) return;
    if(!(await areFriends(socket.userId, receiverId))){
      return socket.emit('callFailed',{message:'Utilisateur non autorisé'});
    }

    const delivered = emitToUser(io, receiverId, 'incomingCall', {
      callerId:socket.userId,
      offer
    });

    if(!delivered){
      socket.emit('callFailed',{message:'Utilisateur non connecté'});
    }
  });

  socket.on('answerCall',async ({callerId,answer})=>{
    if(!socket.userId) return;
    if(!mongoose.isValidObjectId(callerId)) return;
    if(!(await areFriends(socket.userId, callerId))) return;

    emitToUser(io, callerId, 'callAnswered', {answer});
  });

  socket.on('iceCandidate',async ({receiverId,candidate})=>{
    if(!socket.userId) return;
    if(!mongoose.isValidObjectId(receiverId)) return;
    if(!(await areFriends(socket.userId, receiverId))) return;

    emitToUser(io, receiverId, 'iceCandidate', {candidate});
  });

  socket.on('endCall',async ({receiverId})=>{
    if(!socket.userId) return;
    if(!mongoose.isValidObjectId(receiverId)) return;
    if(!(await areFriends(socket.userId, receiverId))) return;

    emitToUser(io, receiverId, 'callEnded');
  });

  socket.on('disconnect',async()=>{
    if(socket.userId){
      const becameOffline = removeConnection(socket.userId, socket.id);

      lastMessageTimes.delete(
        socket.userId
      );

      // Ne marque offline que si c'était le dernier socket actif de cet
      // utilisateur — un 2e onglet/appareil encore connecté doit garder
      // l'utilisateur en ligne.
      if (becameOffline) {
        await User.findByIdAndUpdate(
          socket.userId,
          {isOnline:false}
        );
      }
    }
  });
});

app.use(
  express.static(
    path.join(__dirname,'dist')
  )
);

app.get('/sitemap.xml',(req,res)=>{
  res.type('application/xml');

  res.sendFile(
    path.join(
      __dirname,
      'dist',
      'sitemap.xml'
    )
  );
});

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

const PORT=process.env.PORT||3000;

server.listen(
  PORT,
  '0.0.0.0',
  ()=>console.log(
    `🚀 Serveur lancé sur le port ${PORT}`
  )
);
