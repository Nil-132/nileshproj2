// models/Score.js
const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  chapter: String,
  score: Number,
  total: Number,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Score', scoreSchema);
