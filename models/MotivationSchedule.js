const mongoose = require('mongoose');

const motivationSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  weeks: [{
    weekNumber: { type: Number, required: true },
    days: [{
      dayNumber: { type: Number, required: true },
      message: { type: String, required: true, default: 'You can do it! 💪' }
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('MotivationSchedule', motivationSchema);
