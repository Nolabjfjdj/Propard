const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const messageSchema = new mongoose.Schema({
  sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  receiver:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  content:{type:String,default:null},
  isCallEvent:{type:Boolean,default:false},
  callStartedAt:{type:Date,default:null},
  callEndedAt:{type:Date,default:null},
  callDurationSeconds:{type:Number,min:0,default:null},
  originalContent:{type:String,default:null},
  encrypted:{type:Boolean,default:true},
  edited:{type:Boolean,default:false},
  deleted:{type:Boolean,default:false},
  read:{type:Boolean,default:false},
  createdAt:{type:Date,default:Date.now}
});

module.exports = registerModel('Message', messageSchema);