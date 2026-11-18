const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const groupMessageSchema = new mongoose.Schema({
  group:{type:mongoose.Schema.Types.ObjectId,ref:'Group',required:true,index:true},
  sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  content:{type:String,required:true,maxlength:20000},
  messageType:{type:String,enum:['text','poll'],default:'text'},
  scheduledMessageId:{type:mongoose.Schema.Types.ObjectId,ref:'ScheduledMessage',default:null},
  attachments:{type:[{type:mongoose.Schema.Types.ObjectId,ref:'FileAttachment'}],default:[],validate:v=>Array.isArray(v)&&v.length<=10},
  encrypted:{type:Boolean,default:true},
  keyVersion:{type:Number,min:1,default:null},
  edited:{type:Boolean,default:false},
  deleted:{type:Boolean,default:false},
  expiresAt:{type:Date,default:null},
  pinned:{type:Boolean,default:false},
  pinnedAt:{type:Date,default:null},  pinnedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 32 },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt:{type:Date,default:Date.now}
});

groupMessageSchema.index({group:1,createdAt:-1});

groupMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

groupMessageSchema.index({ scheduledMessageId: 1 }, { unique: true, sparse: true });

module.exports = registerModel('GroupMessage', groupMessageSchema);