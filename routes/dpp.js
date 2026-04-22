const express = require('express');
const router = express.Router();
const Dpp = require('../models/Dpp');
const DppResult = require('../models/DppResult');
const Lecture = require('../models/Lecture');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
};

// Convert raw question format (text, options, ans, diff, date) to schema format
function normalizeQuestions(rawQuestions) {
  return rawQuestions.map((q, index) => ({
    id: q.id || `q${index + 1}`,
    type: q.type || 'multiple-choice',
    questionText: q.text || q.questionText || '',
    options: q.options || [],
    correctAnswer: q.ans !== undefined ? q.ans : q.correctAnswer,
    explanation: q.explanation || '',
    difficulty: q.diff || q.difficulty || 'MEDIUM',
    date: q.date || ''
  }));
}

// GET list of lectures that have a DPP
router.get('/lectures', async (req, res) => {
  const dpps = await Dpp.find({}, 'lectureId lectureName subject');
  res.json(dpps);
});

// GET single DPP by lectureId
router.get('/:lectureId', async (req, res) => {
  const dpp = await Dpp.findOne({ lectureId: req.params.lectureId });
  if (!dpp) return res.status(404).json({ error: 'DPP not found' });
  res.json(dpp);
});

// POST upload/update DPP (accepts raw questions)
router.post('/upload', async (req, res) => {
  try {
    const dppData = req.body;
    if (!dppData.lectureName || !Array.isArray(dppData.questions)) {
      return res.status(400).json({ error: 'lectureName and questions array are required' });
    }

    dppData.questions = normalizeQuestions(dppData.questions);

    if (!dppData.lectureId) {
      const lecture = await Lecture.findOne({
        title: { $regex: new RegExp('^' + dppData.lectureName + '$', 'i') }
      });
      if (!lecture) {
        return res.status(400).json({ error: `No lecture found with name "${dppData.lectureName}"` });
      }
      dppData.lectureId = lecture._id.toString();
    }

    const dpp = await Dpp.findOneAndUpdate(
      { lectureId: dppData.lectureId },
      dppData,
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, dpp });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST submit answers
router.post('/submit', authenticate, async (req, res) => {
  const { lectureId, lectureName, answers } = req.body;
  const userId = req.user.id;
  const dpp = await Dpp.findOne({ lectureId });
  if (!dpp) return res.status(404).json({ error: 'DPP not found' });

  let correctCount = 0;
  const processed = answers.map(ans => {
    const q = dpp.questions.find(q => q.id === ans.questionId);
    const isCorrect = q && ans.selectedOption === q.correctAnswer;
    if (isCorrect) correctCount++;
    return { ...ans, isCorrect };
  });

  const score = (correctCount / dpp.questions.length) * 100;
  const result = await DppResult.create({
    userId,
    lectureId,
    lectureName,
    totalQuestions: dpp.questions.length,
    correctAnswers: correctCount,
    score,
    answers: processed,
    submittedAt: new Date()
  });

  res.json({ success: true, result: { id: result._id, score, correctCount, totalQuestions: dpp.questions.length } });
});

// GET user results
router.get('/results/:userId?', authenticate, async (req, res) => {
  const targetId = req.params.userId || req.user.id;
  const results = await DppResult.find({ userId: targetId }).sort({ submittedAt: -1 });
  res.json(results);
});

// GET analytics for a lecture
router.get('/analytics/:lectureId', authenticate, async (req, res) => {
  const results = await DppResult.find({ userId: req.user.id, lectureId: req.params.lectureId }).sort({ submittedAt: 1 });
  res.json({ attempts: results });
});

module.exports = router;
