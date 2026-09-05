const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);
async function areFriends(userId,friendId){const user=await User.findById(userId).select('friends');return !!user&&user.friends.some(f=>f.userId.toString()===friendId.toString());}

// ─── Ajout d'ami : par ipAlias (existant) OU directement par userId ─────────
// Le userId est nécessaire pour le bouton "Ajouter comme ami" de la page de
// profil (on connaît déjà l'ID en visitant un profil, pas forcément
// l'ipAlias). Comportement par ipAlias inchangé pour compatibilité.
router.post('/add',async(req,res)=>{try{
  const {ipAlias,userId}=req.body;
  let targetUser=null;

  if(userId){
    if(!mongoose.isValidObjectId(userId))return res.status(400).json({error:'ID invalide'});
    targetUser=await User.findById(userId);
  }else if(ipAlias){
    targetUser=await User.findOne({ipAlias});
  }else{
    return res.status(400).json({error:'ipAlias ou userId requis'});
  }

  if(!targetUser)return res.status(404).json({error:'Aucun utilisateur trouvé'});
  if(targetUser._id.toString()===req.user.id.toString())return res.status(400).json({error:"Impossible de s'ajouter soi-même"});

  const currentUser=await User.findById(req.user.id);

  // Blocage dans un sens ou dans l'autre : on refuse silencieusement sans
  // révéler lequel des deux a bloqué l'autre.
  const targetBlockedMe=(targetUser.blockedUsers||[]).some(id=>id.toString()===req.user.id.toString());
  const iBlockedTarget=(currentUser.blockedUsers||[]).some(id=>id.toString()===targetUser._id.toString());
  if(targetBlockedMe||iBlockedTarget)return res.status(400).json({error:"Impossible d'envoyer une demande à cet utilisateur"});

  if(currentUser.friends.some(f=>f.userId.toString()===targetUser._id.toString()))return res.status(400).json({error:'Vous êtes déjà amis'});
  if(targetUser.friendRequests.some(r=>r.from.toString()===req.user.id.toString()))return res.status(400).json({error:'Demande déjà envoyée'});
  targetUser.friendRequests.push({from:req.user.id});await targetUser.save();res.json({message:"Demande d'ami envoyée"});
}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});

router.post('/accept',async(req,res)=>{try{const {fromUserId}=req.body;const currentUser=await User.findById(req.user.id);const fromUser=await User.findById(fromUserId);if(!fromUser){currentUser.friendRequests=currentUser.friendRequests.filter(r=>r.from.toString()!==fromUserId.toString());await currentUser.save();return res.status(404).json({error:"Cet utilisateur n'existe plus"});}const i=currentUser.friendRequests.findIndex(r=>r.from.toString()===fromUserId.toString());if(i===-1)return res.status(400).json({error:'Demande introuvable'});currentUser.friendRequests.splice(i,1);if(!currentUser.friends.some(f=>f.userId.toString()===fromUserId.toString()))currentUser.friends.push({userId:fromUserId,nickname:null});if(!fromUser.friends.some(f=>f.userId.toString()===req.user.id.toString()))fromUser.friends.push({userId:req.user.id,nickname:null});await currentUser.save();await fromUser.save();res.json({message:'Ami ajouté avec succès'});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.post('/decline',async(req,res)=>{try{const {fromUserId}=req.body;const user=await User.findById(req.user.id);const i=user.friendRequests.findIndex(r=>r.from.toString()===fromUserId.toString());if(i===-1)return res.status(400).json({error:'Demande introuvable'});user.friendRequests.splice(i,1);await user.save();res.json({message:'Demande refusée'});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.patch('/nickname',async(req,res)=>{try{const {friendId,nickname}=req.body;const user=await User.findById(req.user.id);const friend=user.friends.find(f=>f.userId.toString()===friendId.toString());if(!friend)return res.status(404).json({error:'Ami introuvable'});friend.nickname=nickname||null;await user.save();res.json({message:'Surnom mis à jour'});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.get('/unread',async(req,res)=>{try{const user=await User.findById(req.user.id);if(!user)return res.status(404).json({error:'Utilisateur introuvable'});const out={};for(const friendId of user.friends.map(f=>f.userId)){const count=await Message.countDocuments({sender:friendId,receiver:req.user.id,read:false,deleted:{$ne:true}});if(count>0)out[friendId.toString()]=count;}res.json(out);}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.patch('/messages/read/:friendId',async(req,res)=>{try{if(!await areFriends(req.user.id,req.params.friendId))return res.status(403).json({error:"Vous n'êtes pas amis avec cet utilisateur"});await Message.updateMany({sender:req.params.friendId,receiver:req.user.id,read:false},{read:true});res.json({success:true});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.get('/messages/:friendId',async(req,res)=>{try{const {friendId}=req.params;if(!await areFriends(req.user.id,friendId))return res.status(403).json({error:"Vous n'êtes pas amis avec cet utilisateur"});const messages=await Message.find({$or:[{sender:req.user.id,receiver:friendId},{sender:friendId,receiver:req.user.id}],deleted:{$ne:true}}).sort({createdAt:1}).limit(50).populate('sender','username ipAlias');res.json(messages);}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
router.delete('/messages/:messageId',async(req,res)=>{try{const message=await Message.findById(req.params.messageId);if(!message)return res.status(404).json({error:'Message introuvable'});if(message.sender.toString()!==req.user.id.toString())return res.status(403).json({error:'Non autorisé'});const receiverId=message.receiver.toString(),messageId=message._id.toString();await Message.deleteOne({_id:message._id});const io=req.app.get('io'),emitToUser=req.app.get('emitToUser');if(io&&emitToUser)emitToUser(io,receiverId,'messageDeleted',{messageId});res.json({success:true,messageId});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});
// La modification d'un message est désormais propagée en temps réel au
// destinataire via l'événement `messageEdited`. Le serveur ne manipule
// que le ciphertext déjà chiffré côté client — aucun texte en clair ne
// transite ni n'est stocké ici, l'E2EE n'est pas dégradé.
router.patch('/messages/:messageId',async(req,res)=>{try{const {content}=req.body;if(!content||typeof content!=='string'||!content.trim())return res.status(400).json({error:'Contenu requis'});const message=await Message.findById(req.params.messageId);if(!message)return res.status(404).json({error:'Message introuvable'});if(message.sender.toString()!==req.user.id.toString())return res.status(403).json({error:'Non autorisé'});message.content=content.trim();message.originalContent=null;message.edited=true;await message.save();const io=req.app.get('io'),emitToUser=req.app.get('emitToUser');if(io&&emitToUser){emitToUser(io,message.receiver.toString(),'messageEdited',{messageId:message._id.toString(),content:message.content,edited:true});}res.json({success:true,message:{_id:message._id,sender:message.sender,receiver:message.receiver,content:message.content,encrypted:true,edited:true,createdAt:message.createdAt}});}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});

// ──────────────────────────────────────────────────────────────────────────
// NOUVEAU : profil — suppression d'ami, blocage, déblocage
// Placées après les routes existantes (notamment /messages/:messageId) pour
// que `/:friendId` générique ne les intercepte jamais par erreur.
// ──────────────────────────────────────────────────────────────────────────

// ─── Suppression d'un ami (symétrique) ───────────────────────────────────
// Ne touche jamais aux messages : relation d'amitié et conversation restent
// deux choses séparées, comme demandé.
router.delete('/:friendId',async(req,res)=>{try{
  const {friendId}=req.params;
  if(!mongoose.isValidObjectId(friendId))return res.status(400).json({error:'ID invalide'});

  const currentUser=await User.findById(req.user.id);
  const friendUser=await User.findById(friendId);
  if(!friendUser)return res.status(404).json({error:'Utilisateur introuvable'});

  const wasFriend=currentUser.friends.some(f=>f.userId.toString()===friendId.toString());
  if(!wasFriend)return res.status(400).json({error:"Vous n'êtes pas ami avec cet utilisateur"});

  currentUser.friends=currentUser.friends.filter(f=>f.userId.toString()!==friendId.toString());
  friendUser.friends=friendUser.friends.filter(f=>f.userId.toString()!==req.user.id.toString());

  await currentUser.save();
  await friendUser.save();

  const io=req.app.get('io'),emitToUser=req.app.get('emitToUser');
  if(io&&emitToUser)emitToUser(io,friendId,'friendRemoved',{userId:req.user.id});

  res.json({success:true,message:'Ami supprimé'});
}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});

// ─── Blocage d'un utilisateur ────────────────────────────────────────────
// Bloquer rompt une amitié existante des deux côtés (la messagerie repose
// entièrement sur `friends`, donc c'est nécessaire pour empêcher l'envoi
// de nouveaux messages), nettoie les demandes d'ami en attente dans les
// deux sens, mais ne supprime JAMAIS les messages déjà échangés.
router.post('/block/:userId',async(req,res)=>{try{
  const {userId}=req.params;
  if(!mongoose.isValidObjectId(userId))return res.status(400).json({error:'ID invalide'});
  if(userId.toString()===req.user.id.toString())return res.status(400).json({error:'Impossible de se bloquer soi-même'});

  const currentUser=await User.findById(req.user.id);
  const targetUser=await User.findById(userId);
  if(!targetUser)return res.status(404).json({error:'Utilisateur introuvable'});

  const alreadyBlocked=(currentUser.blockedUsers||[]).some(id=>id.toString()===userId.toString());
  if(alreadyBlocked)return res.status(400).json({error:'Déjà bloqué'});

  currentUser.blockedUsers.push(userId);

  const wereFriends=currentUser.friends.some(f=>f.userId.toString()===userId.toString());
  if(wereFriends){
    currentUser.friends=currentUser.friends.filter(f=>f.userId.toString()!==userId.toString());
    targetUser.friends=targetUser.friends.filter(f=>f.userId.toString()!==req.user.id.toString());
  }

  currentUser.friendRequests=currentUser.friendRequests.filter(r=>r.from.toString()!==userId.toString());
  targetUser.friendRequests=targetUser.friendRequests.filter(r=>r.from.toString()!==req.user.id.toString());

  await currentUser.save();
  await targetUser.save();

  if(wereFriends){
    const io=req.app.get('io'),emitToUser=req.app.get('emitToUser');
    // Volontairement le même événement `friendRemoved` que pour une
    // suppression classique : l'autre utilisateur voit son ami disparaître
    // de sa liste, sans qu'on lui confirme explicitement qu'il a été
    // bloqué (évite de révéler le blocage).
    if(io&&emitToUser)emitToUser(io,userId,'friendRemoved',{userId:req.user.id});
  }

  res.json({success:true,message:'Utilisateur bloqué'});
}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});

// ─── Déblocage d'un utilisateur ──────────────────────────────────────────
// Ne restaure jamais automatiquement l'amitié précédente.
router.post('/unblock/:userId',async(req,res)=>{try{
  const {userId}=req.params;
  if(!mongoose.isValidObjectId(userId))return res.status(400).json({error:'ID invalide'});

  const currentUser=await User.findById(req.user.id);
  const wasBlocked=(currentUser.blockedUsers||[]).some(id=>id.toString()===userId.toString());
  if(!wasBlocked)return res.status(400).json({error:"Cet utilisateur n'est pas bloqué"});

  currentUser.blockedUsers=currentUser.blockedUsers.filter(id=>id.toString()!==userId.toString());
  await currentUser.save();

  res.json({success:true,message:'Utilisateur débloqué'});
}catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}});

module.exports=router;