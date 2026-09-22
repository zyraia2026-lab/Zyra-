const r = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const { protect } = require("../middleware/auth");
const V = require("../controllers/voiceController");

const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "unknown",
  message: { message: "Demasiadas solicitudes. Espera un momento." },
  standardHeaders: true, legacyHeaders: false, validate: { keyGeneratorIpFallback: false },
});

r.post("/start",   protect, voiceLimiter, V.startCall);
r.post("/discard", protect, voiceLimiter, V.discardCall);

module.exports = r;
