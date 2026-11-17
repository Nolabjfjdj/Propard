const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const messageSchema = new mongoose.Schema({
  sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  receiver:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  content:{type:String,default:null},
  attachments:{type:[{type:mongoose.Schema.Types.ObjectId,ref:'FileAttachment'}],default:[],validate:v=>Array.isArray(v)&&v.length<=10},
  originalContent:{type:String,default:null},
  encrypted:{type:Boolean,default:true},
  edited:{type:Boolean,default:false},
  deleted:{type:Boolean,default:false},
  pinned:{type:Boolean,default:false},
  pinnedAt:{type:Date,default:null},  pinnedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  read:{type:Boolean,default:false},
  readReceiptSent:{type:Boolean,default:true},
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 32 },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt:{type:Date,default:Date.now}
});

module.exports = registerModel('Message', messageSchema);