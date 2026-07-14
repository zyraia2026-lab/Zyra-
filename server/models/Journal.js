const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, default: "Mi diario" },
  content:   { type: String, required: true },
  emotion:   { type: String, default: "" },
  tags:      [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
S.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model("Journal", S);