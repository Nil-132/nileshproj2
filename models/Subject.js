const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    icon: {
        type: String,
        default: '📚'
    },
    color: {
        type: String,
        default: '#3b82f6'
    },
    order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
