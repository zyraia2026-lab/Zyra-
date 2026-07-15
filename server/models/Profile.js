const mongoose = require("mongoose");

const S = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  bio:  { type: String, default: "" },
  photoUrl:    { type: String, default: "" },
  avatarEmoji: { type: String, default: "" },
  avatarColor: { type: String, default: "#6366f1" },

  // ── Emociones ──
  currentEmotion: { type: String, enum: ["feliz","tranquilo","ansioso","triste","enojado","confundido","esperanzado","agotado","motivado","nostalgico"], default: "tranquilo" },
  emotionHistory: [{ emotion: String, note: String, intensity: { type: Number, default: 5 }, date: { type: Date, default: Date.now } }],

  // ── Sesiones y racha ──
  sessionsCount:  { type: Number, default: 0 },
  streakDays:     { type: Number, default: 0 },
  lastSession:    { type: Date },
  lastActiveDate: { type: Date, default: null },

  // ── Gamificación ──
  coins:                  { type: Number, default: 0 },
  missionsCompletedToday: [{ type: String }],
  missionsResetAt:        { type: Date, default: null },
  achievements:           [{ type: String }],
  unlockedItems:          [{ type: String }],
  equippedBadge:          { type: String, default: "" },

  // ── Contacto de emergencia ──
  emergencyContact: {
    name:     { type: String, default: "" },
    phone:    { type: String, default: "" },
    email:    { type: String, default: "" },
    relation: { type: String, default: "" }
  },

  // ── PIN de bloqueo ──
  pin:       { type: String, default: "" },  // guardado como hash
  pinEnabled: { type: Boolean, default: false },

  // ── Recordatorio diario ──
  reminderEnabled:    { type: Boolean, default: false },
  reminderHour:       { type: Number, default: 9 },   // hora 0-23
  reminderMinute:     { type: Number, default: 0 },
  lastReminderSentAt: { type: Date, default: null },

  // ── Personalización ──
  theme: { type: String, enum: ["default","ocean","forest","sunset","midnight"], default: "default" },

  // ── Onboarding ──
  onboardingDone: { type: Boolean, default: false },

  // ── Eventos de crisis (para historial interno) ──
  crisisEvents: [{ message: String, timestamp: { type: Date, default: Date.now } }],

  // ── Patrones emocionales ──
  negativeStreakCount: { type: Number, default: 0 }, // días consecutivos con emoción negativa

  updatedAt: { type: Date, default: Date.now }
});

// Index for daily reminder cron: find profiles matching exact hour/minute
S.index({ reminderEnabled: 1, reminderHour: 1, reminderMinute: 1 });

module.exports = mongoose.model("Profile", S);