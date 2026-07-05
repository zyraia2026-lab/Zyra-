const mongoose = require("mongoose");

const S = new mongoose.Schema({
  email:    { type: String, required: true, index: true },
  key:      { type: String, required: true, unique: true }, // email o "reset_email"
  code:     { type: String, required: true },
  expires:  { type: Date,   required: true },
  data:     { type: Object, default: {} },   // userData o { userId }
}, { timestamps: true });

// MongoDB elimina automáticamente documentos expirados
S.index({ expires: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTPCode", S);
