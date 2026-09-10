const r = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const { protect } = require("../middleware/auth");
const G = require("../controllers/gamificationController");

const gamifLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "unknown",
  message: { message: "Demasiadas solicitudes. Espera un momento." },
  standardHeaders: true, legacyHeaders: false, validate: { keyGeneratorIpFallback: false },
});

r.get("/status",          protect, gamifLimiter, G.getStatus);
r.post("/visit",          protect, gamifLimiter, G.recordVisit);
r.post("/mission/:id",    protect, gamifLimiter, G.completeMission);
r.post("/redeem/:id",     protect, gamifLimiter, G.redeemReward);
r.post("/equip/:itemId",  protect, gamifLimiter, G.equipItem);
r.post("/test-start",     protect, gamifLimiter, G.startTest);
r.post("/song-start",     protect, gamifLimiter, G.checkSongQuota);

module.exports = r;
