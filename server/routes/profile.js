const r = require("express").Router();
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const {
  getProfile,
  updateProfile,
  addEmotionRecord,
  getEmotionHistory,
  setEmergencyContact,
  getEmergencyContact,
  setPin,
  verifyPin,
  disablePin,
  exportData,
  deleteAllData,
  deleteAccount,
  getPlanStatus,
  moodCheckin,
  getMoodStatus,
} = require("../controllers/profileController");
const { protect }      = require("../middleware/auth");
const { requirePlan }  = require("../middleware/planGate");

// Rate limit estricto para PIN (20 intentos / 15 min por IP + user)
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req.user?._id?.toString() || "") + "_" + ipKeyGenerator(req),
  message: { message: "Demasiados intentos de PIN. Espera 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Perfil básico ──
r.get("/",        protect, getProfile);
r.put("/",        protect, updateProfile);

// ── Emociones ──
r.post("/emotion",        protect, addEmotionRecord);
r.get("/history",         protect, getEmotionHistory);

// ── Check-in de humor diario ──
r.post("/mood-checkin", protect, moodCheckin);
r.get("/mood-status",   protect, getMoodStatus);

// ── Contacto de emergencia (plan básico+) ──
r.get("/emergency",  protect, getEmergencyContact);
r.post("/emergency", protect, requirePlan("basic"), setEmergencyContact);

// ── PIN ──
r.post("/pin",         protect, setPin);
r.post("/pin/verify",  protect, pinLimiter, verifyPin);
r.delete("/pin",       protect, disablePin);

// ── Datos ──
r.get("/export",    protect, requirePlan("basic"), exportData);
r.delete("/data",   protect, deleteAllData);
r.delete("/account",protect, deleteAccount);

// ── Plan ──
r.get("/plan", protect, getPlanStatus);

module.exports = r;