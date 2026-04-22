const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: 'multiple-choice' },
  questionText: { type: String, required: true },
  options: [{ type: String }],
  correctAnswer: { type: Number, required: true },
  explanation: { type: String, default: '' },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], default: 'MEDIUM' },
  date: { type: String, default: '' }
}, { _id: false });

const DppSchema = new mongoose.Schema({
  lectureId: { type: String, required: true, unique: true, index: true },
  lectureName: { type: String, required: true },
  subject: { type: String, default: 'General' },
  questions: [QuestionSchema]
}, { timestamps: true });

module.exports = mongoose.model('Dpp', DppSchema);
