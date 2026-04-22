require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MODELS ==========
const User = require('./models/User');
const Subject = require('./models/Subject');
const Chapter = require('./models/Chapter');
const Lecture = require('./models/Lecture');
const Dpp = require('./models/Dpp');
const DppResult = require('./models/DppResult');
const Otp = require('./models/Otp');
const LiveSchedule = require('./models/LiveSchedule');
const Progress = require('./models/Progress'); // for lecture completion
const MotivationSchedule = require('./models/MotivationSchedule');

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.BASE_URL || true,
    credentials: true
}));

app.set('view engine', 'ejs');

// 🆕 Disable caching for all API routes – prevents stale data after bfcache
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ========== NODEMAILER ==========
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ========== AUTH MIDDLEWARE ==========
const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ success: false, msg: "Please login" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
        next();
    } catch (err) {
        res.status(401).json({ success: false, msg: "Session expired" });
    }
};

// Redirect authenticated users away from public pages
const redirectIfAuthenticated = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return next(); // not logged in, proceed normally

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        // Token is valid → user is logged in, send them to dashboard
        return res.redirect('/dashboard.html');
    } catch (err) {
        // Invalid/expired token → clear cookie and continue
        res.clearCookie('token');
        next();
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, msg: "Admin access required" });
    next();
};

// ========== PUBLIC ROUTES ==========
// Public pages – redirect logged-in users to dashboard
// Helper to set no-cache headers
const setNoCache = (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
};

app.get('/', redirectIfAuthenticated, (req, res) => {
    setNoCache(res);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', redirectIfAuthenticated, (req, res) => {
    setNoCache(res);
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup.html', redirectIfAuthenticated, (req, res) => {
    setNoCache(res);
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/forgot-password.html', redirectIfAuthenticated, (req, res) => {
    setNoCache(res);
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

// ⬇️ ADD THIS LINE ⬇️
app.use(express.static('public'));

// Send OTP
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, msg: 'Email required' });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await Otp.findOneAndUpdate(
            { email },
            { otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
                                   { upsert: true, new: true }
        );
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Signup OTP - My PW',
            html: `<div style="font-family: Arial; max-width:500px; margin:auto; padding:20px; background:#f8fafc; border-radius:12px;">
            <h2 style="color:#1e40af; text-align:center;">My PW</h2>
            <div style="background:white; padding:20px; border-radius:10px; text-align:center;">
            <h1 style="font-size:42px; letter-spacing:8px; color:#1e40af;">${otp}</h1>
            </div>
            <p style="text-align:center;">Valid for 10 minutes.</p>
            </div>`
        });
        res.json({ success: true, msg: 'OTP sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, msg: 'Failed to send OTP' });
    }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const record = await Otp.findOne({ email });
        if (!record || record.otp !== otp) return res.status(400).json({ success: false, msg: 'Invalid OTP' });
        await Otp.deleteOne({ email });
        res.json({ success: true, msg: 'OTP verified' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Verification failed' });
    }
});

// Signup (with OTP check)
app.post('/api/signup', [
    body('name').trim().notEmpty(),
         body('email').isEmail().normalizeEmail(),
         body('password').isLength({ min: 6 }),
         body('otp').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
        const { name, email, password, otp } = req.body;
        const otpRecord = await Otp.findOne({ email });
        if (!otpRecord || otpRecord.otp !== otp) return res.status(400).json({ success: false, msg: 'Invalid OTP' });
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, msg: 'Email already registered' });
        //const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password, isVerified: true });
        await Otp.deleteOne({ email });
        const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, msg: 'Account created', user: { id: user._id, name, email, role: user.role } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, msg: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ success: false, msg: 'Invalid credentials' });
        const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, msg: 'Logged in', user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, msg: 'Logged out' });
});

// ========== PROTECTED ROUTES ==========
app.get('/api/me', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user });
});

// ---------- SUBJECTS ----------
app.get('/api/subjects', authenticate, async (req, res) => {
    const subjects = await Subject.find().sort('order');
    res.json(subjects);
});

app.post('/api/subjects', authenticate, isAdmin, async (req, res) => {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ success: false, msg: 'Name required' });
    const existing = await Subject.findOne({ name });
    if (existing) return res.status(400).json({ success: false, msg: 'Subject already exists' });
    const subject = await Subject.create({ name, icon, color });
    res.json({ success: true, subject });
});

app.delete('/api/subjects/:id', authenticate, isAdmin, async (req, res) => {
    await Subject.findByIdAndDelete(req.params.id);
    await Chapter.deleteMany({ subjectId: req.params.id });
    const lectures = await Lecture.find({ subjectId: req.params.id });
    for (let lec of lectures) {
        await Progress.deleteMany({ lecture: lec._id });
        await Dpp.deleteOne({ lectureId: lec._id.toString() });
        await DppResult.deleteMany({ lectureId: lec._id.toString() });
        await Lecture.findByIdAndDelete(lec._id);
    }
    res.json({ success: true });
});

// ---------- CHAPTERS ----------
app.get('/api/chapters', authenticate, async (req, res) => {
    const { subjectId } = req.query;
    if (!subjectId) return res.status(400).json([]);
    const chapters = await Chapter.find({ subjectId }).sort('order');
    res.json(chapters);
});

app.post('/api/chapters', authenticate, isAdmin, async (req, res) => {
    const { subjectId, title, order } = req.body;
    if (!subjectId || !title) return res.status(400).json({ success: false, msg: 'Missing fields' });
    const chapter = await Chapter.create({ subjectId, title, order: order || Date.now() });
    res.json({ success: true, chapter });
});

app.delete('/api/chapters/:id', authenticate, isAdmin, async (req, res) => {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ success: false });
    await Lecture.deleteMany({ chapterId: chapter._id });
    await Chapter.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ---------- LECTURES ----------
app.get('/api/lectures', authenticate, async (req, res) => {
    const { subjectId, chapterId } = req.query;
    let query = {};
    if (subjectId) query.subjectId = subjectId;
    if (chapterId) query.chapterId = chapterId;
    const lectures = await Lecture.find(query).sort('createdAt');

    // Get all lecture IDs as strings for DPP lookup
    const lectureIds = lectures.map(l => l._id.toString());
    // Find which lectures have a DPP
    const dpps = await Dpp.find({ lectureId: { $in: lectureIds } }, 'lectureId');
    const dppSet = new Set(dpps.map(d => d.lectureId));

    // Attach completion status and hasDpp flag
    const progress = await Progress.find({ user: req.user.id, lecture: { $in: lectures.map(l => l._id) } });
    const completedIds = new Set(progress.map(p => p.lecture.toString()));
    const enriched = lectures.map(l => ({
        ...l.toObject(),
                                        completed: completedIds.has(l._id.toString()),
                                        hasDpp: dppSet.has(l._id.toString())   // true if a DPP exists for this lecture
    }));
    res.json(enriched);
});

app.get('/api/lectures/:id', authenticate, async (req, res) => {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false });
    res.json(lecture);
});

app.post('/api/lectures', authenticate, isAdmin, async (req, res) => {
    const { subjectId, chapterId, title, date, duration, youtubeId, imageUrl, pdfLink, dppLink } = req.body;
    if (!subjectId || !chapterId || !title) return res.status(400).json({ success: false, msg: 'Missing required fields' });
    const lecture = await Lecture.create({ subjectId, chapterId, title, date, duration, youtubeId, imageUrl, pdfLink, dppLink });
    res.json({ success: true, lecture });
});

app.put('/api/lectures/:id', authenticate, isAdmin, async (req, res) => {
    const updates = req.body;
    const lecture = await Lecture.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, lecture });
});

app.delete('/api/lectures/:id', authenticate, isAdmin, async (req, res) => {
    await Lecture.findByIdAndDelete(req.params.id);
    await Progress.deleteMany({ lecture: req.params.id });
    await Dpp.deleteOne({ lectureId: req.params.id });
    await DppResult.deleteMany({ lectureId: req.params.id });
    res.json({ success: true });
});

// Mark lecture complete
app.post('/api/lectures/:id/complete', authenticate, async (req, res) => {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ success: false, msg: 'Lecture not found' });
    await Progress.findOneAndUpdate(
        { user: req.user.id, lecture: req.params.id },
        { completed: true, completedAt: new Date() },
                                    { upsert: true }
    );
    res.json({ success: true });
});

// ---------- LIVE SCHEDULES ----------
app.get('/api/live/today', authenticate, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const schedules = await LiveSchedule.find({ date: today }).sort('time');
    res.json(schedules);
});

app.post('/api/live', authenticate, isAdmin, async (req, res) => {
    const { title, category, date, time, duration, youtubeId } = req.body;
    if (!title || !category || !date || !time) return res.status(400).json({ success: false, msg: 'Missing fields' });
    const schedule = await LiveSchedule.create({ title, category, date, time, duration, youtubeId });
    res.json({ success: true, schedule });
});

app.delete('/api/live/:id', authenticate, isAdmin, async (req, res) => {
    await LiveSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ---------- DPP ROUTES ----------
app.get('/api/dpp/lectures', authenticate, async (req, res) => {
    const dpps = await Dpp.find({}, 'lectureId lectureName subject');
    res.json(dpps);
});

app.get('/api/dpp/:lectureId', authenticate, async (req, res) => {
    const dpp = await Dpp.findOne({ lectureId: req.params.lectureId });
    if (!dpp) return res.status(404).json({ error: 'DPP not found' });
    res.json(dpp);
});

app.post('/api/dpp/upload', authenticate, isAdmin, async (req, res) => {
    try {
        const dppData = req.body;
        if (!dppData.lectureId || !dppData.questions || !Array.isArray(dppData.questions)) {
            return res.status(400).json({ error: 'lectureId and questions array required' });
        }
        // Normalize questions
        const normalized = dppData.questions.map((q, i) => ({
            id: q.id || `q${i+1}`,
            type: q.type || 'multiple-choice',
            questionText: q.text || q.questionText,
            options: q.options || [],
            correctAnswer: q.ans !== undefined ? q.ans : q.correctAnswer,
            explanation: q.explanation || '',
            difficulty: q.diff || q.difficulty || 'MEDIUM',
            date: q.date || ''
        }));
        dppData.questions = normalized;
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

// ========== UPDATE DPP (PUT) ==========
app.put('/api/dpp/:lectureId', authenticate, isAdmin, async (req, res) => {
    try {
        const { lectureId } = req.params;
        const { questions } = req.body;

        if (!questions || !Array.isArray(questions)) {
            return res.status(400).json({ error: 'questions array required' });
        }

        // Normalize questions to match schema
        const normalizedQuestions = questions.map((q, i) => ({
            id: q.id || `q${i+1}`,
            type: q.type || 'multiple-choice',
            questionText: q.questionText || q.text || '',
            options: q.options || [],
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : q.ans,
            explanation: q.explanation || '',
            difficulty: q.difficulty || q.diff || 'MEDIUM',
            date: q.date || ''
        }));

        // Find the DPP by lectureId and update questions
        const dpp = await Dpp.findOne({ lectureId });
        if (!dpp) {
            return res.status(404).json({ error: 'DPP not found' });
        }

        dpp.questions = normalizedQuestions;
        await dpp.save();

        res.json({ success: true, dpp });
    } catch (error) {
        console.error('PUT /api/dpp/:lectureId error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dpp/submit', authenticate, async (req, res) => {
    const { lectureId, lectureName, answers } = req.body;
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
        userId: req.user.id,
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

// DELETE DPP by lectureId
app.delete('/api/dpp/:lectureId', authenticate, isAdmin, async (req, res) => {
    try {
        const { lectureId } = req.params;
        const dpp = await Dpp.findOneAndDelete({ lectureId });
        if (!dpp) {
            return res.status(404).json({ error: 'DPP not found' });
        }
        // Also delete all results for this DPP
        await DppResult.deleteMany({ lectureId });
        res.json({ success: true, message: 'DPP and associated results deleted' });
    } catch (error) {
        console.error('DELETE /api/dpp/:lectureId error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dpp/analytics/:lectureId', authenticate, async (req, res) => {
    const results = await DppResult.find({ userId: req.user.id, lectureId: req.params.lectureId }).sort('submittedAt');
    res.json({ attempts: results });
});



// ---------- FORGOT / RESET PASSWORD ----------
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ success: false, msg: 'No account with that email' });
    }

    // Generate reset token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Save token to user
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset link
    const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;

    // Beautiful HTML Email Template
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password</title>
    </head>
    <body style="margin:0; padding:0; background:#1a1a1a; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;">
    <tr>
    <td align="center">
    <table width="100%" cellpadding="20" cellspacing="0" border="0" style="max-width:600px;">
    <tr>
    <td style="padding:40px 20px;">

    <h2 style="color:#ffffff; text-align:center; margin:0 0 30px 0; font-size:26px;">
    Reset Password
    </h2>

    <!-- Main Dark Box with Big Click Here -->
    <div style="background:#111111; padding:40px 30px; border-radius:16px; text-align:center;">

    <p style="color:#a0a0ff; font-size:19px; margin:0 0 25px 0; font-weight:600;">
    Click here to reset your password
    </p>

    <!-- Big Centered CLICK HERE Button -->
    <a href="${resetLink}"
    style="display:inline-block;
    font-size:46px;
    letter-spacing:14px;
    color:#5b9cff;
    text-decoration:none;
    font-weight:bold;
    background:#222222;
    padding:25px 55px;
    border-radius:14px;
    box-shadow:0 8px 25px rgba(91, 156, 255, 0.3);
    margin:10px 0 20px 0;">
    CLICK HERE
    </a>

    <p style="color:#888888; font-size:15px; margin:20px 0 0 0;">
    This link expires in <strong>1 hour</strong>.
    </p>
    </div>

    <!-- Safety note -->
    <p style="text-align:center; color:#666666; font-size:14px; margin:30px 0 0 0;">
    If you didn’t request a password reset, you can safely ignore this email.
    </p>

    </td>
    </tr>
    </table>
    </td>
    </tr>
    </table>
    </body>
    </html>`;

    // Send email
    try {
        await transporter.sendMail({
            from: '"Your App Name" <no-reply@yourdomain.com>',   // ← Change this
            to: email,
            subject: 'Reset Password',
            html: htmlTemplate
        });

        res.json({ success: true, msg: 'Reset link sent to your email' });
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ success: false, msg: 'Failed to send email' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, msg: 'Invalid or expired token' });
    //user.password = await bcrypt.hash(newPassword, 10);
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ success: true, msg: 'Password reset successful' });
});

// ---------- SEEDING (Admin & Subjects) ----------
async function seedAdmin() {
    const existing = await User.findOne({ role: 'admin' });
    if (!existing && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        //const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await User.create({ name: 'Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: 'admin', isVerified: true });
        console.log('✅ Admin seeded');
    }
}
async function seedSubjects() {
    const count = await Subject.countDocuments();
    if (count === 0) {
        await Subject.insertMany([
            { name: 'Quantitative Aptitude', icon: '📊', color: 'blue', order: 1 },
            { name: 'Reasoning Ability', icon: '🧠', color: 'purple', order: 2 },
            { name: 'English Language', icon: '📖', color: 'green', order: 3 },
            { name: 'Banking Awareness', icon: '🏦', color: 'orange', order: 4 },
            { name: 'Current Affairs', icon: '🌍', color: 'red', order: 5 }
        ]);
        console.log('✅ Default subjects seeded');
    }
}

// ---------- MOTIVATION SCHEDULE ----------

// Get current active schedule (used by dashboard popup)
app.get('/api/motivation/current', authenticate, async (req, res) => {
    try {
        const schedule = await MotivationSchedule.findOne({ isActive: true });
        if (!schedule) return res.json({ success: false, msg: 'No active schedule' });

        const start = new Date(schedule.startDate);
        const now = new Date();
        const diffTime = now - start;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return res.json({ success: false, msg: 'Plan has not started yet' });
        }

        const weekNumber = Math.floor(diffDays / 7) + 1;
        const dayNumber = (diffDays % 7) + 1;

        const weekData = schedule.weeks.find(w => w.weekNumber === weekNumber);
        if (!weekData) {
            return res.json({ success: false, msg: `Week ${weekNumber} not configured` });
        }

        const dayData = weekData.days.find(d => d.dayNumber === dayNumber);
        if (!dayData) {
            return res.json({ success: false, msg: `Day ${dayNumber} not configured` });
        }

        res.json({
            success: true,
            weekNumber,
            dayNumber,
            message: dayData.message,
            startDate: schedule.startDate
        });
    } catch (error) {
        console.error('Motivation error:', error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Admin: Get all schedules
app.get('/api/motivation', authenticate, isAdmin, async (req, res) => {
    const schedules = await MotivationSchedule.find().sort('-createdAt');
    res.json(schedules);
});

// Admin: Create a new schedule
app.post('/api/motivation', authenticate, isAdmin, async (req, res) => {
    try {
        const { startDate, weeks, isActive } = req.body;
        if (!startDate || !weeks || !Array.isArray(weeks)) {
            return res.status(400).json({ success: false, msg: 'Missing required fields' });
        }

        if (isActive) {
            await MotivationSchedule.updateMany({}, { isActive: false });
        }

        const schedule = await MotivationSchedule.create({ startDate, weeks, isActive });
        res.json({ success: true, schedule });
    } catch (error) {
        console.error('Create motivation error:', error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Admin: Update a schedule
app.put('/api/motivation/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const updates = req.body;
        if (updates.isActive) {
            await MotivationSchedule.updateMany({ _id: { $ne: req.params.id } }, { isActive: false });
        }
        const schedule = await MotivationSchedule.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json({ success: true, schedule });
    } catch (error) {
        console.error('Update motivation error:', error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Admin: Delete a schedule
app.delete('/api/motivation/:id', authenticate, isAdmin, async (req, res) => {
    try {
        await MotivationSchedule.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete motivation error:', error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// ========== START SERVER ==========
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB connected');
        await seedAdmin();
        await seedSubjects();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};
startServer();
