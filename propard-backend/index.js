const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const mongoose=require('mongoose');
const cors=require('cors');
const jwt=require('jsonwebtoken');
const path=require('path');
const {randomUUID}=require('crypto');
require('dotenv').config();

const app=express();
const server=http.createServer(app);

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

app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
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

const connectedUsers=new Map();

function addConnection(userId,socketId){
  if(!connectedUsers.has(userId)){
    connectedUsers.set(userId,new Set());
  }
  connectedUsers.get(userId).add(socketId);
}

function removeConnection(userId,socketId){
  const set=connectedUsers.get(userId);
  if(!set) return false;
  set.delete(socketId);
  if(set.size===0){
    connectedUsers.delete(userId);
    return true;
  }
  return false;
}

function emitToUser(ioInstance,userId,event,payload){
  const set=connectedUsers.get(userId);
  if(!set || set.size===0) return false;

  for(const socketId of set){
    ioInstance.to(socketId).emit(event,payload);
  }

  return true;
}

app.set('io',io);
app.set('connectedUsers',connectedUsers);
app.set('emitToUser',emitToUser);

app.use('/api/auth',require('./routes/auth'));
app.use('/api/friends',require('./routes/friends'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/admin/reports',require('./routes/reportsAdmin'));
app.use('/api/announcements',require('./routes/announcements'));
app.use('/api',require('./routes/turn'));
app.use('/api/reports',require('./routes/reports'));
app.use('/api/groups',require('./routes/groups'));
app.use('/api/push',require('./routes/push'));

app.get('/health',(req,res)=>res.status(200).send('OK'));

const lastMessageTimes=new Map();

const Message=require('./models/Message');
const User=require('./models/User');
const Group=require('./models/Group');
const GroupMessage=require('./models/GroupMessage');
const {sendPushNotification}=require('./services/push');

async function areFriends(userId,friendId){
  const user=await User.findById(userId).select('friends');

  return !!user &&
    user.friends.some(
      f=>f.userId.toString()===friendId.toString()
    );
}

/*
 * ─────────────────────────────────────
 * APPELS DE GROUPE
 *
 * État conservé uniquement en mémoire :
 * aucune donnée audio/vidéo n'est stockée par le serveur.
 * Le serveur ne fait que relayer la signalisation WebRTC.
 * ─────────────────────────────────────
 */

const groupCalls=new Map();
const privateCalls=new Map();

const getPrivateCallKey=(a,b)=>[a.toString(),b.toString()].sort().join(':');

function getGroupCall(groupId){
  return groupCalls.get(groupId.toString());
}

async function getGroupForMember(groupId,userId){
  if(!mongoose.isValidObjectId(groupId) ||
     !mongoose.isValidObjectId(userId)){
    return null;
  }

  return Group.findOne({
    _id:groupId,
    'members.userId':userId
  }).select('_id members name avatar');
}

function emitToGroupCall(call,event,payload){
  for(const memberId of call.members){
    emitToUser(
      io,
      memberId,
      event,
      payload
    );
  }
}

function isCallMember(call,userId){
  return !!call &&
    call.members.has(userId.toString());
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

      const wasOffline=!connectedUsers.has(decoded.id);

      addConnection(
        decoded.id,
        socket.id
      );

      if(wasOffline){
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

  // ─────────────────────────────────────
  // MESSAGES
  // ─────────────────────────────────────

  socket.on('sendMessage',async({receiverId,content})=>{
    try{
      if(!socket.userId) return;

      if(
        !content ||
        typeof content!=='string' ||
        !content.trim()
      ){
        return;
      }

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

      lastMessageTimes.set(socket.userId,now);

      const message=await Message.create({
        sender:socket.userId,
        receiver:receiverId,
        content:content.trim(),
        originalContent:null,
        encrypted:true
      });

      const sender=await User
        .findById(socket.userId)
        .select('username ipAlias');

      const messageData={
        _id:message._id.toString(),
        sender:socket.userId,
        senderInfo:sender,
        receiver:receiverId,
        content:message.content,
        encrypted:true,
        createdAt:message.createdAt
      };

      emitToUser(
        io,
        receiverId,
        'newMessage',
        messageData
      );

      void sendPushNotification(receiverId, {
        title: sender?.username ? `@${sender.username}` : 'Propard',
        body: 'Nouveau message',
        url: '/',
        tag: `private-${socket.userId}`,
        data: {
          type: 'private-message',
          senderId: socket.userId.toString()
        }
      });

      socket.emit('messageSent',messageData);

    }catch(e){
      console.error('sendMessage error:',e);

      socket.emit(
        'messageError',
        {message:'Impossible d’envoyer le message.'}
      );
    }
  });

  // ─────────────────────────────────────
  // MESSAGES DE GROUPE
  // ─────────────────────────────────────

  socket.on('sendGroupMessage',async({groupId,content})=>{
    try{
      if(!socket.userId) return;

      if(
        !mongoose.isValidObjectId(groupId) ||
        typeof content!=='string' ||
        !content.trim()
      ){
        return socket.emit(
          'groupMessageError',
          {message:'Message de groupe invalide.'}
        );
      }

      let encrypted;

      try{
        encrypted=JSON.parse(content);
      }catch{
        return socket.emit(
          'groupMessageError',
          {message:'Message chiffré invalide.'}
        );
      }

      if(
        !encrypted ||
        encrypted.v!==1 ||
        typeof encrypted.iv!=='string' ||
        typeof encrypted.ct!=='string'
      ){
        return socket.emit(
          'groupMessageError',
          {message:'Message chiffré invalide.'}
        );
      }

      const group=await Group.findOne({
        _id:groupId,
        'members.userId':socket.userId
      });

      if(!group){
        return socket.emit(
          'groupMessageError',
          {message:'Tu ne fais pas partie de ce groupe.'}
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

      lastMessageTimes.set(socket.userId,now);

      const message=await GroupMessage.create({
        group:groupId,
        sender:socket.userId,
        content:content.trim(),
        encrypted:true
      });

      group.lastMessageAt=message.createdAt;
      await group.save();

      const sender=await User.findById(socket.userId)
        .select('username displayName avatar ipAlias');

      const messageData={
        _id:message._id.toString(),
        group:groupId.toString(),
        sender:socket.userId,
        senderInfo:sender,
        content:message.content,
        encrypted:true,
        createdAt:message.createdAt
      };

      for(const member of group.members){
        const memberId=member.userId.toString();

        emitToUser(
          io,
          memberId,
          'newGroupMessage',
          messageData
        );

        if(memberId!==socket.userId.toString()){
          void sendPushNotification(memberId, {
            title: group.name || 'Propard',
            body: sender?.username
              ? `@${sender.username} a envoyé un message`
              : 'Nouveau message de groupe',
            url: '/',
            tag: `group-${groupId.toString()}`,
            data: {
              type: 'group-message',
              groupId: groupId.toString(),
              senderId: socket.userId.toString()
            }
          });
        }
      }

      socket.emit('groupMessageSent',messageData);

    }catch(e){
      console.error('sendGroupMessage error:',e);

      socket.emit(
        'groupMessageError',
        {message:'Impossible d’envoyer le message de groupe.'}
      );
    }
  });

  // ─────────────────────────────────────
  // WEBRTC PRIVÉ
  // ─────────────────────────────────────

  socket.on('callUser',async({receiverId,offer})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId)) return;

    if(!(await areFriends(socket.userId,receiverId))){
      return socket.emit(
        'callFailed',
        {message:'Utilisateur non autorisé'}
      );
    }

    const key=getPrivateCallKey(socket.userId,receiverId);
    let call=privateCalls.get(key);

    if(!call){
      call={
        callerId:socket.userId.toString(),
        receiverId:receiverId.toString(),
        startedAt:Date.now()
      };
      privateCalls.set(key,call);
    }

    const delivered=emitToUser(
      io,
      receiverId,
      'incomingCall',
      {
        callerId:socket.userId,
        offer:{...offer,callStartedAt:call.startedAt},
        callStartedAt:call.startedAt
      }
    );

    if(!delivered){
      socket.emit(
        'callFailed',
        {message:'Utilisateur non connecté'}
      );
    }
  });

  socket.on('answerCall',async({callerId,answer})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(callerId)) return;

    if(!(await areFriends(socket.userId,callerId))) return;

    const key=getPrivateCallKey(socket.userId,callerId);
    let call=privateCalls.get(key);

    if(!call){
      call={
        callerId:callerId.toString(),
        receiverId:socket.userId.toString(),
        startedAt:Date.now()
      };
      privateCalls.set(key,call);
    }

    emitToUser(
      io,
      callerId,
      'callAnswered',
      {
        answer,
        callStartedAt:call.startedAt
      }
    );
  });

  socket.on('iceCandidate',async({receiverId,candidate})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId)) return;

    if(!(await areFriends(socket.userId,receiverId))) return;

    emitToUser(
      io,
      receiverId,
      'iceCandidate',
      {candidate}
    );
  });

  socket.on('iceRestartOffer',async({receiverId,offer})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId)) return;

    if(!(await areFriends(socket.userId,receiverId))) return;

    emitToUser(
      io,
      receiverId,
      'iceRestartOffer',
      {
        callerId:socket.userId,
        offer
      }
    );
  });

  socket.on('iceRestartAnswer',async({callerId,answer})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(callerId)) return;

    if(!(await areFriends(socket.userId,callerId))) return;

    emitToUser(
      io,
      callerId,
      'iceRestartAnswer',
      {answer}
    );
  });

  socket.on('endCall',async({receiverId})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId)) return;

    if(!(await areFriends(socket.userId,receiverId))) return;

    privateCalls.delete(
      getPrivateCallKey(socket.userId,receiverId)
    );

    emitToUser(io,receiverId,'callEnded');
  });

  // ─────────────────────────────────────
  // APPELS DE GROUPE — SIGNALISATION
  // ─────────────────────────────────────

  socket.on('groupCallStart',async({groupId})=>{
    try{
      if(!socket.userId) return;

      const group=await getGroupForMember(
        groupId,
        socket.userId
      );

      if(!group){
        return socket.emit(
          'groupCallError',
          {groupId,message:'Tu ne fais pas partie de ce groupe.'}
        );
      }

      const key=group._id.toString();
      const existing=groupCalls.get(key);

      if(existing){
        const userId=socket.userId.toString();

        // Si un appel est déjà en cours, le bouton d'appel sert aussi
        // de bouton "Rejoindre" : on ajoute directement l'utilisateur
        // à l'appel existant au lieu de créer un nouvel appel.
        existing.members.add(userId);

        socket.emit(
          'groupCallStarted',
          {
            groupId:key,
            callId:existing.callId,
            callStartedAt:existing.startedAt,
            joinedExisting:true
          }
        );

        emitToGroupCall(
          existing,
          'groupCallParticipants',
          {
            groupId:key,
            callId:existing.callId,
            callStartedAt:existing.startedAt,
            participants:[...existing.members]
          }
        );

        return;
      }

      const call={
        callId:randomUUID(),
        groupId:key,
        callerId:socket.userId.toString(),
        startedAt:Date.now(),
        members:new Set([socket.userId.toString()])
      };

      groupCalls.set(key,call);

      socket.emit(
        'groupCallStarted',
        {
          groupId:key,
          callId:call.callId
        }
      );

      for(const member of group.members){
        const memberId=member.userId.toString();

        if(memberId===socket.userId.toString()) continue;

        emitToUser(
          io,
          memberId,
          'groupCallInvite',
          {
            groupId:key,
            callId:call.callId,
            callStartedAt:call.startedAt,
            callerId:socket.userId.toString()
          }
        );
      }

    }catch(e){
      console.error('groupCallStart error:',e);

      socket.emit(
        'groupCallError',
        {
          groupId,
          message:'Impossible de démarrer l’appel de groupe.'
        }
      );
    }
  });

  socket.on('groupCallJoin',async({groupId,callId})=>{
    try{
      if(!socket.userId) return;

      const group=await getGroupForMember(
        groupId,
        socket.userId
      );

      if(!group){
        return socket.emit(
          'groupCallError',
          {groupId,message:'Tu ne fais pas partie de ce groupe.'}
        );
      }

      const key=group._id.toString();
      const call=groupCalls.get(key);

      if(!call || call.callId!==callId){
        return socket.emit(
          'groupCallError',
          {groupId:key,callId,message:'Cet appel n’existe plus.'}
        );
      }

      call.members.add(socket.userId.toString());

      emitToGroupCall(
        call,
        'groupCallParticipants',
        {
          groupId:key,
          callId:call.callId,
          callStartedAt:call.startedAt,
          participants:[...call.members]
        }
      );

    }catch(e){
      console.error('groupCallJoin error:',e);
      socket.emit(
        'groupCallError',
        {groupId,callId,message:'Impossible de rejoindre l’appel.'}
      );
    }
  });

  const relayGroupCallEvent=async(
    eventName,
    {
      groupId,
      callId,
      receiverId,
      callerId,
      offer,
      answer,
      candidate
    }
  )=>{
    if(!socket.userId) return;

    const key=groupId?.toString();
    const call=groupCalls.get(key);

    if(
      !call ||
      call.callId!==callId ||
      !isCallMember(call,socket.userId)
    ){
      return;
    }

    const targetId=(
      receiverId ||
      callerId
    )?.toString();

    if(
      !targetId ||
      targetId===socket.userId.toString() ||
      !isCallMember(call,targetId)
    ){
      return;
    }

    const payload={
      groupId:key,
      callId:call.callId,
      senderId:socket.userId.toString()
    };

    if(offer) payload.offer=offer;
    if(answer) payload.answer=answer;
    if(candidate) payload.candidate=candidate;

    emitToUser(
      io,
      targetId,
      eventName,
      payload
    );
  };

  socket.on(
    'groupCallOffer',
    payload=>relayGroupCallEvent(
      'groupCallOffer',
      payload || {}
    )
  );

  socket.on(
    'groupCallAnswer',
    payload=>relayGroupCallEvent(
      'groupCallAnswer',
      payload || {}
    )
  );

  socket.on(
    'groupCallIceCandidate',
    payload=>relayGroupCallEvent(
      'groupCallIceCandidate',
      payload || {}
    )
  );

  socket.on(
    'groupCallIceRestartOffer',
    payload=>relayGroupCallEvent(
      'groupCallIceRestartOffer',
      payload || {}
    )
  );

  socket.on(
    'groupCallIceRestartAnswer',
    payload=>relayGroupCallEvent(
      'groupCallIceRestartAnswer',
      payload || {}
    )
  );

  socket.on('groupCallLeave',async({groupId,callId})=>{
    try{
      if(!socket.userId) return;

      const key=groupId?.toString();
      const call=groupCalls.get(key);

      if(
        !call ||
        call.callId!==callId ||
        !isCallMember(call,socket.userId)
      ){
        return;
      }

      const leavingId=socket.userId.toString();

      /*
       * Le créateur quitte => l'appel entier se termine.
       * Un membre normal quitte => les autres continuent.
       */
      if(leavingId===call.callerId){
        emitToGroupCall(
          call,
          'groupCallEnded',
          {
            groupId:key,
            callId:call.callId
          }
        );

        groupCalls.delete(key);
        return;
      }

      call.members.delete(leavingId);

      emitToGroupCall(
        call,
        'groupCallMemberLeft',
        {
          groupId:key,
          callId:call.callId,
          userId:leavingId
        }
      );

      if(call.members.size===0){
        groupCalls.delete(key);
      }

    }catch(e){
      console.error('groupCallLeave error:',e);
    }
  });

  // ─────────────────────────────────────
  // DÉCONNEXION
  // ─────────────────────────────────────

  socket.on('disconnect',async()=>{
    if(socket.userId){

      /*
       * Retire cet utilisateur de tous les appels
       * où il était présent.
       */
      const disconnectedUserId=socket.userId.toString();

      for(const [key,call] of groupCalls.entries()){
        if(!call.members.has(disconnectedUserId)) continue;

        if(call.callerId===disconnectedUserId){
          emitToGroupCall(
            call,
            'groupCallEnded',
            {
              groupId:key,
              callId:call.callId
            }
          );

          groupCalls.delete(key);
          continue;
        }

        call.members.delete(disconnectedUserId);

        emitToGroupCall(
          call,
          'groupCallMemberLeft',
          {
            groupId:key,
            callId:call.callId,
            userId:disconnectedUserId
          }
        );

        if(call.members.size===0){
          groupCalls.delete(key);
        }
      }

      for(const [key,call] of privateCalls.entries()){
        if(
          call.callerId===disconnectedUserId ||
          call.receiverId===disconnectedUserId
        ){
          const otherId=
            call.callerId===disconnectedUserId
              ? call.receiverId
              : call.callerId;

          emitToUser(io,otherId,'callEnded');
          privateCalls.delete(key);
        }
      }

      const becameOffline=removeConnection(
        socket.userId,
        socket.id
      );

      lastMessageTimes.delete(
        socket.userId
      );

      if(becameOffline){
        await User.findByIdAndUpdate(
          socket.userId,
          {isOnline:false}
        );
      }
    }
  });
});

// ─────────────────────────────────────────
// PAGES JURIDIQUES PRÉ-RENDUES
// ─────────────────────────────────────────

app.get(
  ['/terms','/terms/'],
  (req,res)=>{
    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'terms.html'
      )
    );
  }
);

app.get(
  ['/privacy','/privacy/'],
  (req,res)=>{
    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'privacy.html'
      )
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
    res.type('application/xml');

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

const PORT=process.env.PORT || 3000;

server.listen(
  PORT,
  '0.0.0.0',
  ()=>console.log(
    `🚀 Serveur lancé sur le port ${PORT}`
  )
);
