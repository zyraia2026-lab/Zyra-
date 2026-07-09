const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date:        { type: String, required: true }, // "Mon Jul 09 2026" — toDateString()
  completions: { type: String, default: "[]" },  // JSON array of habit ids done that day
}, { timestamps: false });
S.index({ user: 1, date: 1 }, { unique: true });
module.exports = mongoose.model("HabitLog", S);
