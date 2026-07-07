const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const T = require("../controllers/ttsController");

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
  message: { message: "Demasiadas peticiones de voz. Espera un momento." },
  standardHeaders: true, legacyHeaders: false,
});

r.post("/speak",        protect, ttsLimiter, T.speak);
r.post("/audio",        protect, ttsLimiter, T.audio);
r.get("/video/:talkId", protect, T.pollVideo);

module.exports = r;
