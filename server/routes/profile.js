const r = require("express").Router();
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
} = require("../controllers/profileController");
const { protect }      = require("../middleware/auth");
const { requirePlan }  = require("../middleware/planGate");

// ── Perfil básico ──
r.get("/",        protect, getProfile);
r.put("/",        protect, updateProfile);

// ── Emociones ──
r.post("/emotion", protect, addEmotionRecord);
r.get("/history",  protect, getEmotionHistory);

// ── Contacto de emergencia (plan básico+) ──
r.get("/emergency",  protect, getEmergencyContact);
r.post("/emergency", protect, requirePlan("basic"), setEmergencyContact);

// ── PIN ──
r.post("/pin",         protect, setPin);
r.post("/pin/verify",  protect, verifyPin);
r.delete("/pin",       protect, disablePin);

// ── Datos ──
r.get("/export",    protect, requirePlan("basic"), exportData);
r.delete("/data",   protect, deleteAllData);
r.delete("/account",protect, deleteAccount);

// ── Plan ──
r.get("/plan", protect, getPlanStatus);

module.exports = r;