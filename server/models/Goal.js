const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, required: true },
  category:  { type: String, enum: ["bienestar","habitos","relaciones","trabajo","personal","mindfulness"], default: "personal" },
  completed: { type: Boolean, default: false },
  reminder:  { type: String, default: "" },
  dueDate:   { type: Date },
  priority:  { type: String, enum: ["alta","media","baja"], default: "media" },
  progress:  { type: Number, min: 0, max: 100, default: 0 },
  notes:     [{ text: { type: String, required: true }, date: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
S.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model("Goal", S);