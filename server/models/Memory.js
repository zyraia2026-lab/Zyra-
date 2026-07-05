const mongoose = require("mongoose");

const S = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:    { type: String, required: true, maxlength: 600 },
  type:       { type: String, enum: ["personal","emotional","preference","relationship","goal","event"], default: "personal" },
  importance: { type: Number, min: 1, max: 5, default: 3 },
  tags:       [String],
  timesReferenced:  { type: Number, default: 0 },
  createdAt:        { type: Date, default: Date.now },
  lastReferencedAt: { type: Date, default: null },
});

S.index({ user: 1, importance: -1 });
module.exports = mongoose.model("Memory", S);
