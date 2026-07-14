const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message:     { type: String, required: true, maxlength: 1000 },
  deliverAt:   { type: Date, required: true },
  delivered:   { type: Boolean, default: false },
  deliveredAt: { type: Date },
  createdAt:   { type: Date, default: Date.now },
});
S.index({ deliverAt: 1, delivered: 1 });
S.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model("FutureNote", S);
