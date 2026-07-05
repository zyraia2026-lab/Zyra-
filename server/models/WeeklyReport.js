const mongoose = require("mongoose");

const S = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  weekOf:      { type: Date, required: true },
  html:        { type: String, required: true },
  summary:     { type: String, default: "" },
  mainEmotion: { type: String, default: "" },
  insights:    [String],
  emotionData: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:   { type: Date, default: Date.now },
});

S.index({ user: 1, weekOf: -1 });
module.exports = mongoose.model("WeeklyReport", S);
