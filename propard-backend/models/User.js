const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  username:{type:String,required:true,unique:true,trim:true,minlength:3,maxlength:20},
  password:{type:String,required:true},
  ipAlias:{type:String,required:true,unique:true},
  publicKey:{type:String,default:null},
  friends:[{userId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},nickname:{type:String,default:null}}],
  friendRequests:[{from:{type:mongoose.Schema.Types.ObjectId,ref:'User'},createdAt:{type:Date,default:Date.now}}],
  isOnline:{type:Boolean,default:false},
  createdAt:{type:Date,default:Date.now}
});
module.exports = mongoose.model('User',userSchema);
