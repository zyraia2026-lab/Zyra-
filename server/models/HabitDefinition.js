const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  habits:  { type: String, default: "[]" }, // JSON-serialized habit array
  updatedAt: { type: Date, default: Date.now },
});
S.index({ user: 1 }, { unique: true });
module.exports = mongoose.model("HabitDefinition", S);
