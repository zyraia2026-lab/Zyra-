const r         = require("express").Router();
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { sendMessage }       = require("../controllers/chatController");
const { protect }           = require("../middleware/auth");
const { safetyGuard }       = require("../middleware/safetyGuard");
const { checkMessageLimit } = require("../middleware/planGate");

// Max 30 mensajes por minuto por usuario (evita scripts abusivos)
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: { message: "Demasiados mensajes seguidos. Espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false,
});

r.post("/", protect, chatLimiter, checkMessageLimit, safetyGuard, sendMessage);
module.exports = r;