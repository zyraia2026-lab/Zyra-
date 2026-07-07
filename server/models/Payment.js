const mongoose = require("mongoose");
const S = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plan:      { type: String, required: true },
  period:    { type: String, enum: ["monthly","annual","demo"], default: "monthly" },
  amount:    { type: Number, default: 0 },
  currency:  { type: String, default: "cop" },
  status:    { type: String, enum: ["paid","refunded","cancelled"], default: "paid" },
  stripeSessionId: { type: String, default: null, sparse: true },
  createdAt: { type: Date, default: Date.now },
});
S.index({ user: 1, createdAt: -1 });
S.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("Payment", S);
