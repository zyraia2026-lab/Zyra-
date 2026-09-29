const r = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const { protect } = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");
const { checkCargas } = require("../middleware/cargasGate");
const { generate, getHistory, getOne, shareReport } = require("../controllers/weeklyReportController");

// Evita que este endpoint se use como relay de correos hacia direcciones al azar.
const shareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "unknown",
  message: { message: "Demasiados envíos. Espera un momento antes de compartir otro reporte." },
  standardHeaders: true, legacyHeaders: false, validate: { keyGeneratorIpFallback: false },
});

r.post("/generate",    protect, requirePlan("basic"), checkCargas(5), generate);
r.get("/history",      protect, requirePlan("basic"), getHistory);
r.get("/:id",          protect, requirePlan("basic"), getOne);
r.post("/:id/share",   protect, requirePlan("basic"), shareLimiter, shareReport);

module.exports = r;
