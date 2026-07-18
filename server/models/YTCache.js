const mongoose = require('mongoose');
const s = new mongoose.Schema({
  key:     { type: String, required: true, unique: true },
  videoId: { type: String, required: true },
}, { timestamps: true });
s.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 días TTL
module.exports = mongoose.model('YTCache', s);
