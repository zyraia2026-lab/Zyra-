const Profile = require("../models/Profile");
const bcrypt  = require("bcryptjs");

// ── GET perfil ──
exports.getProfile = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id });
    if (!p) p = await Profile.create({ user: req.user._id });
    res.json({ success: true, profile: p });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE perfil básico ──
exports.updateProfile = async (req, res) => {
  try {
    const allowed = ["bio","photoUrl","avatarEmoji","avatarColor","currentEmotion","theme","onboardingDone","reminderEnabled","reminderHour","reminderMinute"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    update.updatedAt = Date.now();
    const p = await Profile.findOneAndUpdate(
      { user: req.user._id }, update, { new: true, upsert: true }
    );
    res.json({ success: true, profile: p });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Historial emocional ──
exports.addEmotionRecord = async (req, res) => {
  try {
    const { emotion, note, intensity } = req.body;

    // Calcular racha negativa
    const NEGATIVE = ["ansioso","triste","enojado","agotado","confundido"];
    const isNegative = NEGATIVE.includes(emotion);

    const current = await Profile.findOne({ user: req.user._id });
    const negativeStreak = isNegative
      ? (current?.negativeStreakCount || 0) + 1
      : 0;

    const p = await Profile.findOneAndUpdate(
      { user: req.user._id },
      {
        currentEmotion: emotion,
        negativeStreakCount: negativeStreak,
        $push: { emotionHistory: { emotion, note, intensity: intensity||5, date: new Date() } },
        updatedAt: Date.now()
      },
      { new: true, upsert: true }
    );
    res.json({ success: true, profile: p, negativeStreak });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getEmotionHistory = async (req, res) => {
  try {
    const p = await Profile.findOne({ user: req.user._id });
    res.json({ success: true, history: p ? p.emotionHistory.slice(-30) : [] });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Contacto de emergencia ──
exports.setEmergencyContact = async (req, res) => {
  try {
    const { name, phone, relation } = req.body;
    if (!name?.trim() || !phone?.trim()) return res.status(400).json({ message: "Nombre y teléfono requeridos" });
    const p = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { emergencyContact: { name: name.trim(), phone: phone.trim(), relation: relation?.trim() || "" }, updatedAt: Date.now() },
      { new: true, upsert: true }
    );
    res.json({ success: true, emergencyContact: p.emergencyContact });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getEmergencyContact = async (req, res) => {
  try {
    const p = await Profile.findOne({ user: req.user._id });
    res.json({ success: true, emergencyContact: p?.emergencyContact || null });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── PIN de bloqueo ──
exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ message: "El PIN debe ser de 4 dígitos" });
    const hashed = await bcrypt.hash(pin, 10);
    await Profile.findOneAndUpdate(
      { user: req.user._id },
      { pin: hashed, pinEnabled: true, updatedAt: Date.now() },
      { upsert: true }
    );
    res.json({ success: true, message: "PIN activado" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.verifyPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const p = await Profile.findOne({ user: req.user._id });
    if (!p?.pinEnabled) return res.json({ success: true, valid: true }); // sin PIN activo
    const valid = await bcrypt.compare(String(pin), p.pin);
    res.json({ success: true, valid });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.disablePin = async (req, res) => {
  try {
    await Profile.findOneAndUpdate(
      { user: req.user._id },
      { pin: "", pinEnabled: false, updatedAt: Date.now() }
    );
    res.json({ success: true, message: "PIN desactivado" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Exportar datos ──
exports.exportData = async (req, res) => {
  try {
    const Profile    = require("../models/Profile");
    const Goal       = require("../models/Goal");
    const Journal    = require("../models/Journal");
    const Conversation = require("../models/Conversation");

    const [profile, goals, journals, conversations] = await Promise.all([
      Profile.findOne({ user: req.user._id }).lean(),
      Goal.find({ user: req.user._id }).lean(),
      Journal.find({ user: req.user._id }).lean(),
      Conversation.find({ user: req.user._id }).lean(),
    ]);

    const data = {
      exportDate: new Date().toISOString(),
      user: { name: req.user.name, email: req.user.email },
      profile: { bio: profile?.bio, currentEmotion: profile?.currentEmotion, emotionHistory: profile?.emotionHistory, sessionsCount: profile?.sessionsCount },
      goals,
      journals,
      conversations,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=zyra-datos-${Date.now()}.json`);
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Borrar todos los datos ──
exports.deleteAllData = async (req, res) => {
  try {
    const Goal         = require("../models/Goal");
    const Journal      = require("../models/Journal");
    const Conversation = require("../models/Conversation");

    await Promise.all([
      Profile.findOneAndUpdate({ user: req.user._id }, {
        bio: "", photoUrl: "", emotionHistory: [], crisisEvents: [],
        sessionsCount: 0, streakDays: 0, negativeStreakCount: 0,
        emergencyContact: { name: "", phone: "", relation: "" },
        pin: "", pinEnabled: false, onboardingDone: false, updatedAt: Date.now()
      }),
      Goal.deleteMany({ user: req.user._id }),
      Journal.deleteMany({ user: req.user._id }),
      Conversation.deleteMany({ user: req.user._id }),
    ]);

    res.json({ success: true, message: "Todos tus datos han sido eliminados" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};