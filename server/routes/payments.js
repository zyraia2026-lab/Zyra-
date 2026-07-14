const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const P = require("../controllers/paymentController");

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: { message: "Demasiados intentos de pago. Espera antes de intentar de nuevo." },
  standardHeaders: true, legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: { message: "Demasiadas verificaciones. Espera un momento." },
  standardHeaders: true, legacyHeaders: false,
});

r.post("/checkout", protect, checkoutLimiter, P.createCheckout);
r.get("/verify",    protect, verifyLimiter,   P.verifySession);
r.post("/cancel",   protect, P.cancelPlan);
r.post("/portal",   protect, P.billingPortal);
r.get("/history",   protect, P.paymentHistory);

module.exports = r;
