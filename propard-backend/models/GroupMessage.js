const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const groupMessageSchema = new mongoose.Schema({
  group:{type:mongoose.Schema.Types.ObjectId,ref:'Group',required:true,index:true},
  sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  content:{type:String,required:true,maxlength:20000},
  isCallEvent:{type:Boolean,default:false},
  callStartedAt:{type:Date,default:null},
  callEndedAt:{type:Date,default:null},
  callDurationSeconds:{type:Number,min:0,default:null},
  encrypted:{type:Boolean,default:true},
  edited:{type:Boolean,default:false},
  deleted:{type:Boolean,default:false},
  createdAt:{type:Date,default:Date.now}
});

groupMessageSchema.index({group:1,createdAt:-1});

module.exports = registerModel('GroupMessage', groupMessageSchema);