const Profile = require("../models/Profile");
const bcrypt  = require("bcryptjs");

// ── GET perfil ──
exports.getProfile = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id }).lean();
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

    // Validar longitudes y formatos
    if (update.bio !== undefined && String(update.bio).length > 500)
      return res.status(400).json({ message: "Bio demasiado larga (máx. 500 caracteres)" });
    if (update.avatarEmoji !== undefined && String(update.avatarEmoji).length > 10)
      return res.status(400).json({ message: "Emoji inválido" });
    if (update.avatarColor !== undefined && !/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,50}\)|var\(--[a-z\-]{1,50}\))$/.test(String(update.avatarColor)))
      return res.status(400).json({ message: "Color inválido" });
    if (update.photoUrl !== undefined) {
      const url = String(update.photoUrl);
      const validPhoto = url === "" || url.startsWith("data:image/") || /^https?:\/\/.{1,2000}/.test(url);
      if (!validPhoto) return res.status(400).json({ message: "URL de foto inválida" });
      if (url.length > 2_000_000) return res.status(400).json({ message: "Foto demasiado grande" });
    }
    if (update.reminderHour !== undefined && (update.reminderHour < 0 || update.reminderHour > 23))
      return res.status(400).json({ message: "Hora de recordatorio inválida" });
    if (update.reminderMinute !== undefined && (update.reminderMinute < 0 || update.reminderMinute > 59))
      return res.status(400).json({ message: "Minuto de recordatorio inválido" });

    update.updatedAt = Date.now();
    const p = await Profile.findOneAndUpdate(
      { user: req.user._id }, update, { new: true, upsert: true }
    ).lean();
    res.json({ success: true, profile: p });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Historial emocional ──
exports.addEmotionRecord = async (req, res) => {
  try {
    const { emotion, intensity } = req.body;
    const note = String(req.body.note || "").substring(0, 500);

    // Calcular racha negativa por DÍAS (no por registros)
    const NEGATIVE = ["ansioso","triste","enojado","agotado","confundido"];
    const isNegative = NEGATIVE.includes(emotion);

    const current = await Profile.findOne({ user: req.user._id }).select("emotionHistory negativeStreakCount").lean();
    let negativeStreak = 0;
    if (isNegative) {
      const lastRecord = current?.emotionHistory?.slice(-1)[0];
      const lastDate   = lastRecord ? new Date(lastRecord.date) : null;
      const today      = new Date().toDateString();
      const lastDay    = lastDate ? lastDate.toDateString() : null;
      // Si ya hubo registro negativo hoy, mantener la racha; si es un día nuevo, incrementar
      const alreadyNegativeToday = lastDate && lastDay === today && NEGATIVE.includes(lastRecord.emotion);
      negativeStreak = alreadyNegativeToday
        ? (current?.negativeStreakCount || 1)
        : (current?.negativeStreakCount || 0) + 1;
    }

    const p = await Profile.findOneAndUpdate(
      { user: req.user._id },
      {
        currentEmotion: emotion,
        negativeStreakCount: negativeStreak,
        $push: { emotionHistory: { $each: [{ emotion, note, intensity: intensity||5, date: new Date() }], $slice: -90 } },
        updatedAt: Date.now()
      },
      { new: true, upsert: true }
    ).select("currentEmotion negativeStreakCount").lean();
    res.json({ success: true, profile: p, negativeStreak });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getEmotionHistory = async (req, res) => {
  try {
    const p = await Profile.findOne({ user: req.user._id }).select("emotionHistory").lean();
    res.json({ success: true, history: p ? p.emotionHistory.slice(-30) : [] });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Contacto de emergencia ──
exports.setEmergencyContact = async (req, res) => {
  try {
    const { name, phone, email, relation } = req.body;
    if (!name?.trim() || !phone?.trim()) return res.status(400).json({ message: "Nombre y teléfono requeridos" });
    if (String(name).length > 100) return res.status(400).json({ message: "Nombre demasiado largo" });
    if (String(phone).length > 30) return res.status(400).json({ message: "Teléfono inválido" });
    if (email && String(email).length > 254) return res.status(400).json({ message: "Email demasiado largo" });
    const p = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { emergencyContact: { name: String(name).trim().substring(0,100), phone: String(phone).trim().substring(0,30), email: String(email||"").trim().substring(0,254), relation: String(relation||"").trim().substring(0,50) }, updatedAt: Date.now() },
      { new: true, upsert: true }
    ).select("emergencyContact").lean();
    res.json({ success: true, emergencyContact: p.emergencyContact });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getEmergencyContact = async (req, res) => {
  try {
    const p = await Profile.findOne({ user: req.user._id }).select("emergencyContact").lean();
    res.json({ success: true, emergencyContact: p?.emergencyContact || null });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Check-in de humor diario ──
exports.moodCheckin = async (req, res) => {
  try {
    const { emotion, intensity = 5 } = req.body;
    const note = String(req.body.note || "").substring(0, 500);
    const VALID = ["feliz","tranquilo","ansioso","triste","enojado","confundido","esperanzado","agotado","motivado","nostalgico"];
    if (!VALID.includes(emotion)) return res.status(400).json({ message: "Emoción inválida" });

    const NEGATIVE = ["ansioso","triste","enojado","agotado","confundido"];
    const isNegative = NEGATIVE.includes(emotion);

    // Verificar si ya hizo check-in hoy
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const p = await Profile.findOne({ user: req.user._id }).select("emotionHistory negativeStreakCount").lean();
    const alreadyToday = p?.emotionHistory?.some(h => new Date(h.date) >= todayStart);
    if (alreadyToday) return res.json({ success: true, alreadyDone: true });

    // Calcular racha negativa por días
    let negativeStreak = 0;
    if (isNegative) {
      const lastRecord = p?.emotionHistory?.slice(-1)[0];
      const lastDate   = lastRecord ? new Date(lastRecord.date) : null;
      const lastDay    = lastDate ? lastDate.toDateString() : null;
      const today      = new Date().toDateString();
      const alreadyNegativeToday = lastDate && lastDay === today && NEGATIVE.includes(lastRecord.emotion);
      negativeStreak = alreadyNegativeToday
        ? (p?.negativeStreakCount || 1)
        : (p?.negativeStreakCount || 0) + 1;
    }

    await Profile.findOneAndUpdate(
      { user: req.user._id },
      {
        currentEmotion: emotion,
        negativeStreakCount: negativeStreak,
        $push: { emotionHistory: { emotion, note: note.slice(0, 200), intensity: Math.min(10, Math.max(1, intensity)), date: new Date() } },
      },
      { upsert: true }
    );
    res.json({ success: true, alreadyDone: false });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getMoodStatus = async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const p = await Profile.findOne({ user: req.user._id }).select("emotionHistory currentEmotion").lean();
    const done = p?.emotionHistory?.some(h => new Date(h.date) >= todayStart) || false;
    res.json({ success: true, checkedInToday: done, currentEmotion: p?.currentEmotion || null });
  } catch(e) { res.status(500).json({ message: e.message }); }
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

// Contador en memoria de intentos fallidos: { userId -> { count, lockedUntil } }
const _pinAttempts = new Map();
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 10 * 60 * 1000; // 10 minutos

exports.verifyPin = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const now = Date.now();

    // Verificar bloqueo activo
    const att = _pinAttempts.get(userId);
    if (att?.lockedUntil && now < att.lockedUntil) {
      const secsLeft = Math.ceil((att.lockedUntil - now) / 1000);
      return res.status(429).json({ message: `PIN bloqueado. Intenta en ${secsLeft} segundos.`, locked: true });
    }

    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(String(pin)))
      return res.status(400).json({ message: "PIN debe ser de 4 dígitos" });

    const p = await Profile.findOne({ user: req.user._id }).select("pin pinEnabled").lean();
    if (!p?.pinEnabled) return res.json({ success: true, valid: true }); // sin PIN activo

    const valid = await bcrypt.compare(String(pin), p.pin);

    if (!valid) {
      const cur = att?.count || 0;
      const newCount = cur + 1;
      if (newCount >= PIN_MAX_ATTEMPTS) {
        _pinAttempts.set(userId, { count: newCount, lockedUntil: now + PIN_LOCKOUT_MS });
        return res.status(429).json({ message: "Demasiados intentos incorrectos. PIN bloqueado por 10 minutos.", locked: true });
      }
      _pinAttempts.set(userId, { count: newCount, lockedUntil: null });
      return res.json({ success: true, valid: false, attemptsLeft: PIN_MAX_ATTEMPTS - newCount });
    }

    // Éxito — limpiar contador
    _pinAttempts.delete(userId);
    res.json({ success: true, valid: true });
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

// ── Borrar todos los datos (reset de perfil, no elimina la cuenta) ──
exports.deleteAllData = async (req, res) => {
  try {
    const Goal         = require("../models/Goal");
    const Journal      = require("../models/Journal");
    const Conversation = require("../models/Conversation");
    const PushSub      = require("../models/PushSubscription");
    const Memory       = require("../models/Memory");

    await Promise.all([
      Profile.findOneAndUpdate({ user: req.user._id }, {
        bio: "", photoUrl: "", emotionHistory: [], crisisEvents: [],
        sessionsCount: 0, streakDays: 0, negativeStreakCount: 0,
        coins: 0, achievements: [], unlockedItems: [], equippedBadge: "",
        missionsCompletedToday: [], lastActiveDate: null,
        emergencyContact: { name: "", phone: "", relation: "", email: "" },
        pin: "", pinEnabled: false, onboardingDone: false,
        reminderEnabled: false, updatedAt: Date.now()
      }),
      Goal.deleteMany({ user: req.user._id }),
      Journal.deleteMany({ user: req.user._id }),
      Conversation.deleteMany({ user: req.user._id }),
      PushSub.deleteOne({ user: req.user._id }),
      Memory.deleteMany({ user: req.user._id }),
    ]);

    res.json({ success: true, logout: true, message: "Todos tus datos han sido eliminados" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Eliminar cuenta completa ──
exports.deleteAccount = async (req, res) => {
  try {
    const User         = require("../models/User");
    const Goal         = require("../models/Goal");
    const Journal      = require("../models/Journal");
    const Conversation = require("../models/Conversation");
    const OTP          = require("../models/OTPCode");
    const PushSub      = require("../models/PushSubscription");
    const Memory       = require("../models/Memory");

    // Cancelar suscripción Stripe activa si existe
    const user = await User.findById(req.user._id).select("stripeCustomerId plan").lean();
    if (user?.stripeCustomerId && user.plan !== "free") {
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "active", limit: 5 });
        await Promise.all(subs.data.map(s => stripe.subscriptions.cancel(s.id)));
      } catch(stripeErr) {
        console.warn("[deleteAccount] Stripe cancel error:", stripeErr.message);
      }
    }

    await Promise.all([
      Profile.deleteOne({ user: req.user._id }),
      Goal.deleteMany({ user: req.user._id }),
      Journal.deleteMany({ user: req.user._id }),
      Conversation.deleteMany({ user: req.user._id }),
      OTP.deleteMany({ email: req.user.email }),
      PushSub.deleteOne({ user: req.user._id }),
      Memory.deleteMany({ user: req.user._id }),
      User.deleteOne({ _id: req.user._id }),
    ]);

    res.json({ success: true, logout: true, message: "Tu cuenta ha sido eliminada" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Plan status ──
exports.getPlanStatus = async (req, res) => {
  try {
    const User = require("../models/User");
    const { getPlan, LIMITS } = require("../middleware/planGate");
    const user = await User.findById(req.user._id).select("plan planExpiresAt planActivatedAt messagesResetAt messagesUsedToday").lean();
    const { plan, limits, expired } = getPlan(user);

    const now   = new Date();
    const reset = user.messagesResetAt ? new Date(user.messagesResetAt) : null;
    const sameDay = reset && reset.toDateString() === now.toDateString();
    const messagesUsedToday = sameDay ? (user.messagesUsedToday || 0) : 0;

    res.json({
      success: true,
      plan,
      expired,
      planExpiresAt:     user.planExpiresAt || null,
      planActivatedAt:   user.planActivatedAt || null,
      limits,
      messagesUsedToday,
      messagesRemaining: limits.messagesPerDay === Infinity ? null : Math.max(0, limits.messagesPerDay - messagesUsedToday),
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

// ── Activar/actualizar plan (simulado — en prod se haría vía webhook de pago) ──
exports.upgradePlan = async (req, res) => {
  try {
    const User = require("../models/User");
    const { plan, paymentRef } = req.body;

    const VALID = ["free","basic","premium"];
    if (!VALID.includes(plan)) return res.status(400).json({ message: "Plan inválido" });

    const now     = new Date();
    const expires = plan === "free" ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días

    await User.findByIdAndUpdate(req.user._id, {
      plan,
      planActivatedAt: now,
      planExpiresAt:   expires,
    });

    res.json({
      success: true,
      plan,
      planActivatedAt: now,
      planExpiresAt:   expires,
      message: plan === "free" ? "Has vuelto al plan Gratis" : `Plan ${plan === "basic" ? "Básico" : "Premium"} activado correctamente`,
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};