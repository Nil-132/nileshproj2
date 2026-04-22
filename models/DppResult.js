const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true
  },
  selectedOption: {
    type: Number,
    default: -1 // -1 means unanswered
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  timeSpent: {
    type: Number, // in seconds
    default: 0
  }
}, { _id: false });

const DppResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lectureId: {
    type: String,
    required: true,
    index: true
  },
  lectureName: {
    type: String,
    required: true
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  correctAnswers: {
    type: Number,
    required: true
  },
  score: {
    type: Number, // percentage
    required: true
  },
  answers: [AnswerSchema],
  startedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for efficient user+lecture queries
DppResultSchema.index({ userId: 1, lectureId: 1, submittedAt: -1 });

module.exports = mongoose.model('DppResult', DppResultSchema);
