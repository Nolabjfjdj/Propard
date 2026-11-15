const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const userSchema = new mongoose.Schema({
  username:{type:String,required:true,unique:true,trim:true,minlength:3,maxlength:32},
  usernameHistory:{type:[{username:{type:String,required:true},normalized:{type:String,required:true},changedAt:{type:Date,default:Date.now}}],default:[]},
  displayName:{type:String,default:null,trim:true,maxlength:32},
  avatar:{type:String,default:null},
  password:{type:String,required:true,select:false},
  sessionVersion:{type:Number,default:0},
  largeFileUploadStreak:{type:Number,default:0,min:0,max:3},
  largeFileUploadBlockedUntil:{type:Date,default:null},
  fileUploadEvents:{type:[{fileId:{type:mongoose.Schema.Types.ObjectId,required:true},size:{type:Number,required:true,min:1},completedAt:{type:Date,required:true}}],default:[],select:false},
  revokedSessions:{type:[{jti:{type:String,required:true},expiresAt:{type:Date,required:true}}],default:[],select:false},
  staffRole:{type:String,enum:['user','support','junior_moderator','moderator','senior_moderator','admin','owner'],default:'user',index:true},
  staffRoleUpdatedAt:{type:Date,default:null},
  staffRoleUpdatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  staffNotificationPreferences:{passwordReset:{type:Boolean,default:true},support:{type:Boolean,default:true},reports:{type:Boolean,default:true},bans:{type:Boolean,default:true},staffActions:{type:Boolean,default:true}},
  passwordResetTokenHash:{type:String,default:null,select:false},
  passwordResetExpiresAt:{type:Date,default:null,select:false},
  passwordResetIssuedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null,select:false},
  ipAlias:{type:String,required:true,unique:true},
  publicKey:{type:String,default:null},
  passkeys:{type:[{credentialId:{type:String,required:true},rpId:{type:String,default:null},publicKey:{type:String,required:true},counter:{type:Number,default:0},transports:{type:[String],default:[]},deviceType:{type:String,default:'unknown'},backedUp:{type:Boolean,default:false},name:{type:String,default:'Clé d’accès',maxlength:40},createdAt:{type:Date,default:Date.now},lastUsedAt:{type:Date,default:null}}],default:[],select:false},
  passkeyRegistrationChallenge:{type:String,default:null,select:false},
  passkeyRegistrationChallengeExpiresAt:{type:Date,default:null,select:false},
  passkeyRegistrationRpId:{type:String,default:null,select:false},
  passkeyRegistrationOrigin:{type:String,default:null,select:false},
  passkeyLoginChallenge:{type:String,default:null,select:false},
  passkeyLoginChallengeExpiresAt:{type:Date,default:null,select:false},
  passkeyLoginRpId:{type:String,default:null,select:false},
  passkeyLoginOrigin:{type:String,default:null,select:false},
  passkeyRecoveryCodes:{type:[String],default:[],select:false},
  apnsTokens:[{token:{type:String,required:true,maxlength:512},platform:{type:String,enum:['ios'],required:true},createdAt:{type:Date,default:Date.now}}],
  pushSubscriptions:[{endpoint:{type:String,required:true,maxlength:2048},keys:{p256dh:{type:String,required:true,maxlength:256},auth:{type:String,required:true,maxlength:256}},createdAt:{type:Date,default:Date.now}}],
  e2eeKeyBackup:{type:mongoose.Schema.Types.Mixed,default:null},
  realUsername:{type:String,default:null},
  pendingDeletionAt:{type:Date,default:null},
  bannedAt:{type:Date,default:null},
  banExpiresAt:{type:Date,default:null},
  banReason:{type:String,default:null,maxlength:500},
  friends:[{userId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},nickname:{type:String,default:null,maxlength:32}}],
  friendRequests:[{from:{type:mongoose.Schema.Types.ObjectId,ref:'User'},createdAt:{type:Date,default:Date.now}}],
  blockedUsers:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}],
  isOnline:{type:Boolean,default:false},
  acceptedAnnouncements:[{announcementId:{type:mongoose.Schema.Types.ObjectId,ref:'Announcement'},acceptedAt:{type:Date,default:Date.now}}],
  createdAt:{type:Date,default:Date.now}
});

userSchema.index({ 'usernameHistory.normalized': 1 }, { unique: true, sparse: true });

module.exports = registerModel('User', userSchema);