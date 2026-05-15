const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const S = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true, minlength: 6, select: false },
  darkMode:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
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