const r         = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const { sendMessage, streamMessage, journalPrompt } = require("../controllers/chatController");
const { protect }           = require("../middleware/auth");
const { safetyGuard }       = require("../middleware/safetyGuard");
const { checkCargas }       = require("../middleware/cargasGate");

// Max 30 mensajes por minuto por usuario (evita scripts abusivos)
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "unknown",
  message: { message: "Demasiados mensajes seguidos. Espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false,
  validate: { keyGeneratorIpFallback: false },
});

// safetyGuard va antes: si el mensaje es de crisis, responde y corta ahí
// mismo sin llegar a descontar cargas -- el modo emergencia nunca cuesta.
r.post("/",              protect, chatLimiter, safetyGuard, checkCargas(1), sendMessage);
r.post("/stream",        protect, chatLimiter, safetyGuard, checkCargas(1), streamMessage);
r.post("/journal-prompt", protect, journalPrompt);
module.exports = r;