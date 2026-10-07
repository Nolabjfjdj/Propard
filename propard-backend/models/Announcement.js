const mongoose = require('mongoose');
const { registerModel } = require('../db/shards');

const announcementSchema = new mongoose.Schema({
  title:{type:String,required:true,trim:true,maxlength:150},
  message:{type:String,required:true,trim:true,maxlength:5000},
  active:{type:Boolean,default:true},
  createdAt:{type:Date,default:Date.now}
});

module.exports = registerModel('Announcement', announcementSchema);