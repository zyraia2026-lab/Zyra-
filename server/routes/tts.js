const r = require("express").Router();
const { protect }     = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");
const { rateLimit } = require("express-rate-limit");
const T = require("../controllers/ttsController");

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "unknown",
  message: { message: "Demasiadas peticiones de voz. Espera un momento." },
  standardHeaders: true, legacyHeaders: false, validate: { keyGeneratorIpFallback: false },
});

r.post("/speak", protect, requirePlan("premium"), ttsLimiter, T.speak);
// /audio (leer un mensaje del chat en voz alta) ya NO es solo premium: sin
// esto, un usuario Gratis/Basico sin voz femenina en su celular se quedaba
// con la voz generica del dispositivo (suena robotica) en vez de la voz
// neural (StreamElements Dalia, sin costo de API) — la calidad de la voz
// no deberia depender del plan, solo las llamadas de voz en vivo si.
r.post("/audio", protect, ttsLimiter, T.audio);

module.exports = r;
