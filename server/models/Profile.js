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

  // ── Para personalizar los consejos de pulso (opcionales; solo el año, no la fecha) ──
  birthYear:     { type: Number, default: null },
  activityLevel: { type: String, enum: ["bajo", "medio", "alto", null], default: null },
  // "Sobre ti" (opcionales): cómo quiere que Zyra le diga y su género, para hablarle bien
  // ("tranquila", "tranquilo" o, si no lo dice, sin adjetivos con género)
  nickname:      { type: String, default: "", maxlength: 40 },
  gender:        { type: String, enum: ["mujer", "hombre", "no_binario", null], default: null },

  // ── Sesiones y racha ──
  sessionsCount:  { type: Number, default: 0 },
  streakDays:     { type: Number, default: 0 },
  lastSession:    { type: Date },
  lastActiveDate: { type: Date, default: null },

  // ── Gamificación ──
  coins:                  { type: Number, default: 0 },
  streakFreezes:          { type: Number, default: 0 },
  missionsCompletedToday: [{ type: String }],
  missionsResetAt:        { type: Date, default: null },
  achievements:           [{ type: String }],
  unlockedItems:          [{ type: String }],
  equippedBadge:          { type: String, default: "" },
  equippedFrame:          { type: String, default: "" },

  // ── Cupos del plan: llamadas y test emocional ──
  callsUsedThisMonth:     { type: Number, default: 0 },
  callsResetAt:           { type: Date, default: null },
  lastCallStartedAt:      { type: Date, default: null },
  testUsedToday:          { type: Number, default: 0 },
  testResetAt:            { type: Date, default: null },
  songsUsedThisWeek:      { type: Number, default: 0 },
  songsResetAt:           { type: Date, default: null },
  exercisesUsedToday:     { type: Number, default: 0 },
  exercisesResetAt:       { type: Date, default: null },

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
  lastProactiveAt:    { type: Date, default: null },
  lastSundayReflectionAt: { type: Date, default: null },
  lastEveningCheckInAt:   { type: Date, default: null },

  // ── Personalización ──
  theme: { type: String, enum: ["default","ocean","forest","sunset","midnight"], default: "default" },

  // ── Onboarding ──
  onboardingDone:   { type: Boolean, default: false },
  onboardingReason: { type: String, default: "" }, // ansiedad|tristeza|motivacion|hablar|habitos|otro

  // ── Eventos de crisis (para historial interno) ──
  // Los "caringContactXSentAt" trackean los mensajes de seguimiento tipo
  // "Caring Contacts" (evidencia real de prevencion de suicidio: mensajes
  // breves y calidos, sin exigir respuesta, dias despues de una crisis) --
  // sin esto no hay forma de saber cuales ya se enviaron para no repetirlos
  // ni para saber cuales faltan.
  crisisEvents: [{
    message: String,
    timestamp: { type: Date, default: Date.now },
    caringContact1SentAt: { type: Date, default: null },
    caringContact3SentAt: { type: Date, default: null },
    caringContact7SentAt: { type: Date, default: null },
  }],

  // ── Plan de seguridad (Stanley-Brown Safety Planning Intervention) ──
  // Herramienta clinica validada: la persona define esto en un momento
  // tranquilo, y se le muestra de vuelta -- personalizado -- si llega a
  // haber una crisis real. Reduce conducta suicida significativamente mas
  // que solo mostrar numeros de linea de ayuda genericos.
  safetyPlan: {
    warningSigns:         [{ type: String }],
    copingStrategies:     [{ type: String }],
    supportPeople:        [{ name: { type: String }, phone: { type: String } }],
    safeEnvironmentNotes: { type: String, default: "" },
    updatedAt:            { type: Date, default: null },
  },

  // ── Patrones emocionales ──
  negativeStreakCount: { type: Number, default: 0 }, // días consecutivos con emoción negativa

  updatedAt: { type: Date, default: Date.now },

  // ── Sensores de salud (pulso/pasos/reloj) — sincroniza entre dispositivos ──
  health: {
    hr:           { bpm: Number, ts: Date },
    steps:        { count: Number, date: String },
    watchBattery: { type: Number, default: null },
    watchName:    { type: String, default: "" },
    sleepHours:   { type: Number, default: null },
    sleepDate:    { type: String, default: null },
    updatedAt:    { type: Date, default: null },
    // Resumen diario (últimos ~90 días) — lo que le da a Zyra una tendencia real, no solo el momento
    history: [new mongoose.Schema({ date: String, avgHR: Number, minHR: Number, maxHR: Number, hrCount: Number, steps: Number }, { _id: false })],
    // Check-in diario "cuerpo y mente": uno por día (día en hora de Colombia, AAAA-MM-DD), últimos ~120
    checkins: [new mongoose.Schema({ day: String, bpm: Number, emotion: String, body: String, source: String, ts: Date }, { _id: false })],
    // Respiraciones con el pulso en vivo del reloj (pulso al empezar y al terminar), últimas 60
    breaths: [new mongoose.Schema({ ts: Date, tech: String, startBpm: Number, endBpm: Number, seconds: Number }, { _id: false })],
  }
});

// Index for daily reminder cron: find profiles matching exact hour/minute
S.index({ reminderEnabled: 1, reminderHour: 1, reminderMinute: 1 });

module.exports = mongoose.model("Profile", S);