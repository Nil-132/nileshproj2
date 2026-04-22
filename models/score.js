const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  chapter: String,
  score: Number,
  total: Number,
  date: Date
});

module.exports = mongoose.model('Score', scoreSchema);
