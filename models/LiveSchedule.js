const mongoose = require('mongoose');
const liveScheduleSchema = new mongoose.Schema({
  title: String,
  date: String,
  time: String,
  duration: Number,
  category: String,
  youtubeId: String
}, { timestamps: true });
module.exports = mongoose.model('LiveSchedule', liveScheduleSchema);
