const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const mongoose=require('mongoose');
const cors=require('cors');
const jwt=require('jsonwebtoken');
const path=require('path');
const {randomUUID}=require('crypto');
const {createCallStateManager}=require('./services/callState');
const {verifyTurnstile}=require('./middleware/rateLimit');
const {connectShards}=require('./db/shards');
const {
  isEncryptedMessagePayload,
  isSessionDescription,
  isIceCandidate
}=require('./utils/inputValidation');
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

app.use(express.json({limit:'1.5mb'}));

app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://challenges.cloudflare.com; " +
    "script-src-elem 'self' https://challenges.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https: wss: turn: turns: stun: https://challenges.cloudflare.com; " +
    "frame-src 'self' https://challenges.cloudflare.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  next();
});

const databaseReady=connectShards();

const connectedUsers=new Map();
const activeConversations=new Map();

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

function setActiveConversation(userId,socketId,conversation){
  if(!userId || !socketId) return;

  if(!conversation?.active){
    const userConversations=activeConversations.get(userId.toString());
    if(!userConversations) return;

    userConversations.delete(socketId);
    if(userConversations.size===0){
      activeConversations.delete(userId.toString());
    }
    return;
  }

  const type=conversation.type;
  const conversationId=conversation.id?.toString();

  if(
    (type!=='private' && type!=='group') ||
    !mongoose.isValidObjectId(conversationId)
  ){
    return;
  }

  let userConversations=activeConversations.get(userId.toString());
  if(!userConversations){
    userConversations=new Map();
    activeConversations.set(userId.toString(),userConversations);
  }

  userConversations.set(socketId,{
    type,
    id:conversationId
  });
}

function isConversationActive(userId,type,conversationId){
  const userConversations=activeConversations.get(userId.toString());
  if(!userConversations) return false;

  const normalizedId=conversationId?.toString();

  for(const conversation of userConversations.values()){
    if(
      conversation.type===type &&
      conversation.id===normalizedId
    ){
      return true;
    }
  }

  return false;
}

function removeActiveConversation(userId,socketId){
  const userConversations=activeConversations.get(userId.toString());
  if(!userConversations) return;

  userConversations.delete(socketId);
  if(userConversations.size===0){
    activeConversations.delete(userId.toString());
  }
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

async function getFriendNickname(viewerId, friendId){
  const user=await User.findById(viewerId).select('friends');

  if(!user) return null;

  const friendship=user.friends.find(
    f=>f.userId?.toString()===friendId.toString()
  );

  return friendship?.nickname?.trim() || null;
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

const callState=createCallStateManager({
  groupCalls,
  privateCalls,
  emitToUser:(userId,event,payload)=>{
    emitToUser(io,userId,event,payload);
  }
});

const getPrivateCallKey=callState.getPrivateCallKey;

app.set('callState',callState);

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

const socketMessageCaptchaState=new Map();

async function verifySocketMessageCaptcha(socket,captchaToken,kind){
  const userId=socket.userId?.toString();
  if(!userId) return false;

  const now=Date.now();

  if(socketMessageCaptchaState.size>2000){
    for(const [key,state] of socketMessageCaptchaState){
      if(now-state.start>=10000){
        socketMessageCaptchaState.delete(key);
      }
    }
  }

  let state=socketMessageCaptchaState.get(userId);
  if(!state || now-state.start>=10000){
    state={start:now,count:0};
  }

  if(state.count<15){
    state.count+=1;
    socketMessageCaptchaState.set(userId,state);
    return true;
  }

  if(await verifyTurnstile(captchaToken)){
    socketMessageCaptchaState.set(userId,{start:now,count:1});
    return true;
  }

  socketMessageCaptchaState.set(userId,state);
  socket.emit('messageCaptchaRequired',{kind});
  return false;
}

io.on('connection',socket=>{

  console.log(`🔌 Socket connecté: ${socket.id}`);

  socket.on('authenticate',async token=>{
    if(socket.userId){
      socket.emit('authenticated',true);
      return;
    }

    try{
      if(typeof token!=='string' || !token.trim()){
        throw new Error('Token manquant');
      }

      const decoded=jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      if(!decoded?.id){
        throw new Error('Session invalide');
      }

      const tokenSessionVersion=Number.isInteger(decoded.sessionVersion)
        ? decoded.sessionVersion
        : 0;

      const authenticatedUser=await User.findById(decoded.id).select('_id sessionVersion');

      if(!authenticatedUser || authenticatedUser.sessionVersion!==tokenSessionVersion){
        throw new Error('Session expirée');
      }

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

  socket.on('requestPendingCalls',()=>{
    if(!socket.userId) return;

    const pendingPrivateCall = callState.getPendingPrivateCall(socket.userId);

    if(pendingPrivateCall){
      emitToUser(
        io,
        socket.userId,
        'incomingCall',
        {
          callerId: pendingPrivateCall.callerId,
          offer: {
            ...pendingPrivateCall.offer,
            callStartedAt: pendingPrivateCall.startedAt,
            iceCandidates: pendingPrivateCall.pendingIceCandidates || []
          },
          callStartedAt: pendingPrivateCall.startedAt
        }
      );
    }

    for(const call of callState.getPendingGroupCalls(socket.userId)){
      emitToUser(
        io,
        socket.userId,
        'groupCallInvite',
        {
          groupId: call.groupId,
          callId: call.callId,
          callStartedAt: call.startedAt,
          callerId: call.callerId
        }
      );
    }
  });

  // ─────────────────────────────────────
  // MESSAGES
  // ─────────────────────────────────────

  socket.on('setActiveConversation',({type,id,active=true}={})=>{
    if(!socket.userId) return;

    setActiveConversation(
      socket.userId,
      socket.id,
      {type,id,active}
    );
  });

  socket.on('sendMessage',async({receiverId,content,captchaToken}={})=>{
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

      if(!isEncryptedMessagePayload(content)){
        return socket.emit(
          'messageError',
          {message:'Message chiffré invalide ou trop volumineux.'}
        );
      }

      if(!await verifySocketMessageCaptcha(socket,captchaToken,'private')) return;

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

      if(!isConversationActive(
        receiverId,
        'private',
        socket.userId
      )){
        const receiverNickname =
          await getFriendNickname(
            receiverId,
            socket.userId
          );

        void sendPushNotification(receiverId, {
          title: receiverNickname
            ? receiverNickname
            : sender?.username
              ? `@${sender.username}`
              : 'Propard',
          body: 'Nouveau message',
          url: `/chat/${socket.userId.toString()}`,
          tag: `private-${socket.userId}`,
          data: {
            type: 'private-message',
            senderId: socket.userId.toString()
          }
        });
      }

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

  socket.on('sendGroupMessage',async({groupId,content,captchaToken}={})=>{
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

      if(!isEncryptedMessagePayload(content)){
        return socket.emit(
          'groupMessageError',
          {message:'Message chiffré invalide ou trop volumineux.'}
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

      if(!await verifySocketMessageCaptcha(socket,captchaToken,'group')) return;

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

        if(
          memberId!==socket.userId.toString() &&
          !isConversationActive(
            memberId,
            'group',
            groupId
          )
        ){
          const memberNickname =
            await getFriendNickname(
              memberId,
              socket.userId
            );

          void sendPushNotification(memberId, {
            title: group.name || 'Propard',
            body: memberNickname
              ? `${memberNickname} a envoyé un message`
              : sender?.username
                ? `@${sender.username} a envoyé un message`
                : 'Nouveau message de groupe',
            url: `/group/${groupId.toString()}`,
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

  socket.on('callUser',async({receiverId,offer,videoCall=false}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId) || !isSessionDescription(offer,'offer')) return;

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
        startedAt:Date.now(),
        offer,
        videoCall:Boolean(videoCall),
        pendingIceCandidates:[]
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
        callStartedAt:call.startedAt,
        videoCall:Boolean(call.videoCall)
      }
    );

    if(!delivered){
      const caller = await User.findById(socket.userId).select('displayName username');
      const receiverNickname =
        await getFriendNickname(
          receiverId,
          socket.userId
        );
      const callerName =
        receiverNickname ||
        caller?.displayName ||
        caller?.username ||
        'Quelqu’un';

      void sendPushNotification(receiverId, {
        title: `${callerName} t’appelle`,
        body: `${callerName} t’appelle sur Propard`,
        url: `/chat/${socket.userId.toString()}`,
        tag: `call-${socket.userId.toString()}`,
        data: {
          type: 'incoming-call',
          callerId: socket.userId.toString()
        }
      });
    }
  });

  socket.on('answerCall',async({callerId,answer}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(callerId) || !isSessionDescription(answer,'answer')) return;

    if(!(await areFriends(socket.userId,callerId))) return;

    const key=getPrivateCallKey(socket.userId,callerId);
    let call=privateCalls.get(key);

    if(!call){
      call={
        callerId:callerId.toString(),
        receiverId:socket.userId.toString(),
        startedAt:Date.now(),
        answered:true,
        pendingIceCandidates:[]
      };
      privateCalls.set(key,call);
    }else{
      callState.markPrivateCallAnswered(
        callerId,
        socket.userId
      );

      for(const candidate of call.pendingIceCandidates || []){
        emitToUser(
          io,
          socket.userId,
          'iceCandidate',
          {candidate}
        );
      }

      call.pendingIceCandidates=[];
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

  socket.on('iceCandidate',async({receiverId,candidate}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId) || !isIceCandidate(candidate)) return;

    if(!(await areFriends(socket.userId,receiverId))) return;

    const key=getPrivateCallKey(socket.userId,receiverId);
    const call=privateCalls.get(key);
    const delivered=emitToUser(
      io,
      receiverId,
      'iceCandidate',
      {candidate}
    );

    if(!delivered && call){
      call.pendingIceCandidates=call.pendingIceCandidates || [];
      if(call.pendingIceCandidates.length < 100){
        call.pendingIceCandidates.push(candidate);
      }
    }
  });

  socket.on('iceRestartOffer',async({receiverId,offer}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId) || !isSessionDescription(offer,'offer')) return;

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

  socket.on('iceRestartAnswer',async({callerId,answer}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(callerId) || !isSessionDescription(answer,'answer')) return;

    if(!(await areFriends(socket.userId,callerId))) return;

    emitToUser(
      io,
      callerId,
      'iceRestartAnswer',
      {answer}
    );
  });

  socket.on('endCall',async({receiverId}={})=>{
    if(!socket.userId) return;

    if(!mongoose.isValidObjectId(receiverId)) return;

    if(!(await areFriends(socket.userId,receiverId))) return;

    callState.endPrivateCall(
      socket.userId,
      receiverId
    );
  });

  // ─────────────────────────────────────
  // APPELS DE GROUPE — SIGNALISATION
  // ─────────────────────────────────────

  socket.on('groupCallStart',async({groupId,videoCall=false}={})=>{
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
            joinedExisting:true,
            videoCall:Boolean(existing.videoCall)
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

      const callerId=socket.userId.toString();
      const pendingInvites=new Set();

      for(const member of group.members){
        const memberId=member.userId.toString();

        if(
          memberId!==callerId &&
          !connectedUsers.has(memberId)
        ){
          pendingInvites.add(memberId);
        }
      }

      const call={
        callId:randomUUID(),
        groupId:key,
        callerId,
        startedAt:Date.now(),
        members:new Set([callerId]),
        pendingInvites,
        videoCall:Boolean(videoCall)
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

        const delivered=emitToUser(
          io,
          memberId,
          'groupCallInvite',
          {
            groupId:key,
            callId:call.callId,
            callStartedAt:call.startedAt,
            callerId:socket.userId.toString(),
            videoCall:Boolean(call.videoCall)
          }
        );

        if(!delivered){
          const caller = await User.findById(socket.userId).select('displayName username');
          const callerName = caller?.displayName || caller?.username || 'Quelqu’un';

          void sendPushNotification(memberId, {
            title: `${callerName} t’appelle`,
            body: `${callerName} t’appelle dans ${group.name || 'un groupe'}`,
            url: `/group/${key}`,
            tag: `group-call-${key}`,
            data: {
              type: 'group-call',
              groupId: key,
              callerId: socket.userId.toString()
            }
          });
        }
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

  socket.on('groupCallJoin',async({groupId,callId}={})=>{
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

      callState.acceptGroupCall(
        key,
        socket.userId
      );

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

    if(
      (eventName==='groupCallOffer' || eventName==='groupCallIceRestartOffer') &&
      !isSessionDescription(offer,'offer')
    ){
      return;
    }

    if(
      (eventName==='groupCallAnswer' || eventName==='groupCallIceRestartAnswer') &&
      !isSessionDescription(answer,'answer')
    ){
      return;
    }

    if(
      eventName==='groupCallIceCandidate' &&
      !isIceCandidate(candidate)
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

  socket.on('groupCallLeave',async({groupId,callId}={})=>{
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

      callState.removeUserFromGroupCall(
        key,
        socket.userId
      );

    }catch(e){
      console.error('groupCallLeave error:',e);
    }
  });

  // ─────────────────────────────────────
  // DÉCONNEXION
  // ─────────────────────────────────────

  socket.on('disconnect',async()=>{
    if(socket.userId){
      removeActiveConversation(
        socket.userId,
        socket.id
      );
      const becameOffline=removeConnection(
        socket.userId,
        socket.id
      );



      if(becameOffline){
        callState.removeUserFromAllCalls(
          socket.userId
        );

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

databaseReady
  .then(()=>{
    server.listen(
      PORT,
      '0.0.0.0',
      ()=>console.log(
        `🚀 Serveur lancé sur le port ${PORT}`
      )
    );
  })
  .catch(error=>{
    console.error('❌ Impossible de démarrer MongoDB:',error);
    process.exit(1);
  });
