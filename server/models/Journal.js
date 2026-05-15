const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, default: "Mi diario" },
  content:   { type: String, required: true },
  emotion:   { type: String, default: "" },
  tags:      [String],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model("Journal", S);