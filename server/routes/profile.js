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
} = require("../controllers/profileController");
const { protect } = require("../middleware/auth");

// ── Perfil básico ──
r.get("/",        protect, getProfile);
r.put("/",        protect, updateProfile);

// ── Emociones ──
r.post("/emotion", protect, addEmotionRecord);
r.get("/history",  protect, getEmotionHistory);

// ── Contacto de emergencia ──
r.get("/emergency",  protect, getEmergencyContact);
r.post("/emergency", protect, setEmergencyContact);

// ── PIN ──
r.post("/pin",         protect, setPin);
r.post("/pin/verify",  protect, verifyPin);
r.delete("/pin",       protect, disablePin);

// ── Datos ──
r.get("/export",  protect, exportData);
r.delete("/data", protect, deleteAllData);

module.exports = r;