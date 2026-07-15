const mongoose = require("mongoose");

const S = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:    { type: String, required: true, maxlength: 600 },
  type:       { type: String, enum: ["personal","emotional","preference","relationship","goal","event","situation"], default: "personal" },
  importance: { type: Number, min: 1, max: 5, default: 3 },
  tags:       [String],
  timesReferenced:  { type: Number, default: 0 },
  createdAt:        { type: Date, default: Date.now },
  lastReferencedAt: { type: Date, default: null },
  followUpDate:     { type: Date, default: null }, // fecha para hacer seguimiento (ej: "examen el jueves")
  followUpDone:     { type: Boolean, default: false },
});

S.index({ user: 1, importance: -1 });
S.index({ user: 1, followUpDate: 1, followUpDone: 1 }, { sparse: true });
module.exports = mongoose.model("Memory", S);
