const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: '10m' } } // auto-delete after 10 minutes
});

module.exports = mongoose.model('Otp', otpSchema);
