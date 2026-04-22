// models/Lecture.js - Updated (removed global completed field)
const mongoose = require('mongoose');

const lectureSchema = new mongoose.Schema({
  subjectId: { type: String, required: true, index: true },
  chapterId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  date: String,
  duration: String,
  youtubeId: String,
  imageUrl: String,

  // Notes & DPP Features (already present in your original)
  pdfLink: String,     // Google Drive / direct link for Notes PDF
  dppLink: String      // Google Drive / direct link for DPP PDF
}, { timestamps: true });

const Lecture = mongoose.model('Lecture', lectureSchema);

module.exports = Lecture;
