const mongoose = require('mongoose');
const chapterSchema = new mongoose.Schema({
  subjectId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('Chapter', chapterSchema);
