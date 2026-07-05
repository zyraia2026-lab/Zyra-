const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const S = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true, minlength: 8, select: false },
  darkMode:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },

  // ── Suscripción ──
  plan:            { type: String, enum: ["free","basic","premium"], default: "free" },
  planExpiresAt:   { type: Date, default: null },
  planActivatedAt: { type: Date, default: null },

  // ── Uso diario de mensajes ──
  messagesUsedToday: { type: Number, default: 0 },
  messagesResetAt:   { type: Date, default: null },

  // ── Consentimiento legal ──
  termsAcceptedAt:      { type: Date, default: null },
  termsAcceptedVersion: { type: String, default: null },
});

S.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

S.methods.matchPassword = async function(p) {
  return await bcrypt.compare(p, this.password);
};

module.exports = mongoose.model("User", S);