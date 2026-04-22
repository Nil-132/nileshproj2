const mongoose = require('mongoose');
const progressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lecture: { type: mongoose.Schema.Types.ObjectId, ref: 'Lecture', required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: Date.now }
});
progressSchema.index({ user: 1, lecture: 1 }, { unique: true });
module.exports = mongoose.model('Progress', progressSchema);
