const Profile = require("../models/Profile");

/* ════════════════════════════════════════
   CATÁLOGOS ESTÁTICOS
════════════════════════════════════════ */
const DAILY_MISSIONS = [
  { id: "log_emotion",     label: "¿Cómo te sientes hoy?",           emoji: "😊", coins: 10 },
  { id: "write_journal",   label: "Escribe algo en tu diario",       emoji: "📔", coins: 15 },
  { id: "chat_zyra",       label: "Habla con Zyra (5+ mensajes)",    emoji: "💬", coins: 20 },
  { id: "do_exercise",     label: "Haz un ejercicio de bienestar",   emoji: "🧘", coins: 15 },
  { id: "check_goals",     label: "Revisa en qué vas con tus metas", emoji: "🎯", coins: 10 },
  { id: "complete_plan",   label: "Completa una tarea del día",      emoji: "✅", coins: 10 },
  { id: "daily_challenge", label: "Completa el reto diario",         emoji: "⚡", coins: 15 },
  { id: "water",           label: "Toma 8 vasos de agua",            emoji: "💧", coins: 10 },
  { id: "gratitude",       label: "Practica la gratitud",            emoji: "🙏", coins: 10 },
  { id: "weekly_mission",  label: "Misión semanal completada",       emoji: "🏆", coins: 50 },
];

const ACHIEVEMENTS = [
  { id: "first_login",  label: "Primer paso",      emoji: "🌱", desc: "El día que todo empezó" },
  { id: "streak_3",     label: "En racha",          emoji: "🔥", desc: "3 días seguidos — eso ya es disciplina" },
  { id: "streak_7",     label: "Una semana",        emoji: "⚡", desc: "7 días sin fallar. Vas en serio." },
  { id: "streak_14",    label: "Dos semanas",       emoji: "🌙", desc: "14 días y contando" },
  { id: "streak_30",    label: "Un mes entero",     emoji: "👑", desc: "30 días. Esto ya es un estilo de vida." },
  { id: "coins_50",     label: "Primera cosecha",   emoji: "🌾", desc: "50 monedas — el principio de algo" },
  { id: "coins_200",    label: "Coleccionista",     emoji: "💰", desc: "200 monedas. Alguien aquí es constante." },
  { id: "all_missions", label: "Día perfecto",      emoji: "🌟", desc: "Completaste todo lo que había que hacer hoy" },
  { id: "journal_10",   label: "Escritor/a",        emoji: "📚", desc: "10 entradas en el diario — eso requiere valor" },
];

const REWARDS = [
  { id: "badge_fire",    label: "Insignia Fuego",    emoji: "🔥", cost: 30,  type: "badge" },
  { id: "badge_star",    label: "Insignia Estrella", emoji: "⭐", cost: 30,  type: "badge" },
  { id: "badge_moon",    label: "Insignia Luna",     emoji: "🌙", cost: 40,  type: "badge" },
  { id: "badge_crown",   label: "Insignia Corona",   emoji: "👑", cost: 80,  type: "badge" },
  { id: "badge_diamond", label: "Insignia Diamante", emoji: "💎", cost: 120, type: "badge" },
  { id: "theme_ocean",   label: "Tema Océano",       emoji: "🌊", cost: 50,  type: "theme" },
  { id: "theme_forest",  label: "Tema Bosque",       emoji: "🌲", cost: 50,  type: "theme" },
  { id: "theme_sunset",  label: "Tema Atardecer",    emoji: "🌅", cost: 60,  type: "theme" },
  { id: "theme_midnight",label: "Tema Medianoche",   emoji: "🌌", cost: 60,  type: "theme" },
  { id: "frame_glow",    label: "Marco Resplandor",  emoji: "✨", cost: 70,  type: "frame" },
  { id: "frame_rainbow", label: "Marco Arcoíris",    emoji: "🌈", cost: 90,  type: "frame" },
  { id: "streak_freeze", label: "Congelador de Racha", emoji: "🧊", cost: 50, type: "consumable", desc: "Protege tu racha si fallas un día. Se usa automáticamente." },
];

exports.DAILY_MISSIONS = DAILY_MISSIONS;
exports.ACHIEVEMENTS   = ACHIEVEMENTS;
exports.REWARDS        = REWARDS;

/* ── helpers ── */
// Colombia = UTC-5. Compara fechas en hora Colombia para que las misiones
// se reseteen a medianoche local, no a medianoche UTC (7pm Colombia).
function colDateStr(d) {
  const col = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return col.getUTCFullYear() + '-' + (col.getUTCMonth() + 1) + '-' + col.getUTCDate();
}
function isMissionsReset(p) {
  const reset = p.missionsResetAt ? new Date(p.missionsResetAt) : null;
  if (!reset) return true;
  return colDateStr(reset) !== colDateStr(new Date());
}

function checkAchievements(p, newStreak, newCoins, completedMissions, journalCount) {
  const earned = [...(p.achievements || [])];
  const fresh = [];
  const award = (id) => { if (!earned.includes(id)) { earned.push(id); fresh.push(id); } };

  award("first_login");
  if (newStreak >= 3)  award("streak_3");
  if (newStreak >= 7)  award("streak_7");
  if (newStreak >= 14) award("streak_14");
  if (newStreak >= 30) award("streak_30");
  if (newCoins  >= 50)  award("coins_50");
  if (newCoins  >= 200) award("coins_200");
  if (completedMissions && completedMissions.length === DAILY_MISSIONS.length) award("all_missions");
  if (journalCount >= 10) award("journal_10");

  return { earned, fresh };
}

/* ════════════════════════════════════════
   CONTROLLERS
════════════════════════════════════════ */

/* GET /api/gamification/status */
exports.getStatus = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id }).select("streakDays coins equippedBadge equippedFrame missionsCompletedToday missionsResetAt achievements unlockedItems streakFreezes").lean();
    if (!p) p = (await Profile.create({ user: req.user._id })).toObject();

    const needsReset = isMissionsReset(p);
    const completedToday = needsReset ? [] : (p.missionsCompletedToday || []);

    const missions = DAILY_MISSIONS.map(m => ({
      ...m,
      completed: completedToday.includes(m.id),
    }));

    const freezes = p.streakFreezes || 0;
    res.json({
      success: true,
      streak:        p.streakDays || 0,
      coins:         p.coins || 0,
      equippedBadge: p.equippedBadge || "",
      equippedFrame: p.equippedFrame || "",
      missions,
      missionsCompleted: completedToday.length,
      missionsTotal:     DAILY_MISSIONS.length,
      streakFreezes: freezes,
      achievements: ACHIEVEMENTS.map(a => ({ ...a, earned: (p.achievements || []).includes(a.id) })),
      rewards:      REWARDS.map(r => ({ ...r, unlocked: (p.unlockedItems || []).includes(r.id) })),
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/visit  — llamar al abrir la app (actualiza racha) */
exports.recordVisit = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id }).select("streakDays lastActiveDate coins sessionsCount achievements missionsCompletedToday missionsResetAt streakFreezes unlockedItems").lean();
    if (!p) p = (await Profile.create({ user: req.user._id })).toObject();

    const now  = new Date();
    const last = p.lastActiveDate ? new Date(p.lastActiveDate) : null;
    const diff = last ? Math.floor((now - last) / 86400000) : null;

    let streak = p.streakDays || 0;
    let coinsEarned = 0;
    let streakReset = false;
    let freezeUsed  = false;
    const previousStreak = streak;

    // Streak freeze: consumable stored in streakFreezes count
    // Synced from unlockedItems purchases - each purchase of streak_freeze adds 1
    const freezes = p.streakFreezes || 0;

    if (diff === null || diff > 1) {
      if (diff === 2 && freezes > 0) {
        // Missed exactly one day — use a freeze to protect the streak
        freezeUsed = true;
        streak += 1; // count the frozen day as a streak continuation
        coinsEarned = 5;
      } else {
        streakReset = streak >= 3;
        streak = 1;
      }
    } else if (diff === 1) {
      streak += 1;
      coinsEarned = 5; // bonus día consecutivo
    }
    // diff === 0: mismo día, no cambiar

    const newCoins = (p.coins || 0) + coinsEarned;
    const { earned, fresh } = checkAchievements(p, streak, newCoins, null);

    // Coins bonus por logros nuevos de racha
    let achBonus = 0;
    if (fresh.includes("streak_3"))  achBonus += 20;
    if (fresh.includes("streak_7"))  achBonus += 50;
    if (fresh.includes("streak_14")) achBonus += 80;
    if (fresh.includes("streak_30")) achBonus += 200;

    const update = {
      streakDays:    streak,
      lastActiveDate: now,
      coins:          newCoins + achBonus,
      achievements:   earned,
      sessionsCount:  (p.sessionsCount || 0) + (diff !== 0 ? 1 : 0),
      updatedAt:      now,
    };
    if (freezeUsed) update.streakFreezes = Math.max(0, freezes - 1);
    // Reset misiones si es nuevo día
    if (isMissionsReset(p)) {
      update.missionsCompletedToday = [];
      update.missionsResetAt = now;
    }

    await Profile.findOneAndUpdate({ user: req.user._id }, update);

    // Push notification para hitos de racha (fire-and-forget)
    const STREAK_PUSH = {
      streak_7:  { title: "🔥 ¡Una semana seguida!", body: "7 días con Zyra — eso ya muestra carácter. Sigue así." },
      streak_14: { title: "🌙 ¡Dos semanas!", body: "14 días de racha. Eso no es coincidencia — es constancia real." },
      streak_30: { title: "👑 ¡Un mes entero!", body: "30 días seguidos. Esto ya es un estilo de vida. Muy bien." },
    };
    const streakHit = fresh.find(id => STREAK_PUSH[id]);
    if (streakHit) {
      const { sendToUser } = require("./pushController");
      const msg = STREAK_PUSH[streakHit];
      sendToUser(req.user._id, {
        title: msg.title, body: msg.body,
        icon: "/Imagenes/1000154669.png", badge: "/Imagenes/1000154669.png",
        tag: "zyra-streak-milestone", data: { url: "/?p=gamification" },
      }).catch(() => {});
    }

    res.json({
      success: true,
      streak,
      coinsEarned: coinsEarned + achBonus,
      newAchievements: fresh.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean),
      streakReset,
      freezeUsed,
      streakFreezes: freezeUsed ? Math.max(0, freezes - 1) : freezes,
      previousStreak: streakReset ? previousStreak : undefined,
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/mission/:id  — completar una misión */
exports.completeMission = async (req, res) => {
  try {
    const mission = DAILY_MISSIONS.find(m => m.id === req.params.id);
    if (!mission) return res.status(400).json({ message: "Misión desconocida" });

    let p = await Profile.findOne({ user: req.user._id }).select("coins streakDays achievements missionsCompletedToday missionsResetAt").lean();
    if (!p) p = (await Profile.create({ user: req.user._id })).toObject();

    const needsReset  = isMissionsReset(p);
    const completed   = needsReset ? [] : (p.missionsCompletedToday || []);

    if (completed.includes(mission.id)) {
      return res.json({ success: true, alreadyDone: true, coins: p.coins || 0 });
    }

    const newCompleted = [...completed, mission.id];
    let coinsEarned    = mission.coins;
    const newCoins     = (p.coins || 0) + coinsEarned;
    const { earned, fresh } = checkAchievements(p, p.streakDays || 0, newCoins, newCompleted);

    // Bonus misión completa
    if (fresh.includes("all_missions")) coinsEarned += 30;

    let achCoinBonus = 0;
    if (fresh.includes("coins_50"))  achCoinBonus += 10;
    if (fresh.includes("coins_200")) achCoinBonus += 25;
    const finalCoins = (p.coins || 0) + coinsEarned + achCoinBonus;

    const update = {
      $inc:  { coins: coinsEarned + achCoinBonus },
      $addToSet: { missionsCompletedToday: mission.id },
      $set: {
        achievements: earned,
        updatedAt:    new Date(),
      },
    };
    if (needsReset) { update.$set.missionsResetAt = new Date(); update.$set.missionsCompletedToday = [mission.id]; delete update.$addToSet; }

    await Profile.findOneAndUpdate({ user: req.user._id }, update);

    res.json({
      success: true,
      missionId:       mission.id,
      coinsEarned,
      totalCoins:      finalCoins,
      allCompleted:    newCompleted.length === DAILY_MISSIONS.length,
      newAchievements: fresh.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean),
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/redeem/:id  — canjear una recompensa */
exports.redeemReward = async (req, res) => {
  try {
    const reward = REWARDS.find(r => r.id === req.params.id);
    if (!reward) return res.status(400).json({ message: "Recompensa desconocida" });

    // Consumables (streak_freeze) can be bought multiple times — increment counter
    if (reward.type === "consumable") {
      const p = await Profile.findOne({ user: req.user._id }).select("coins streakFreezes").lean();
      if (!p) return res.status(404).json({ message: "Perfil no encontrado" });
      if ((p.coins || 0) < reward.cost) {
        return res.status(403).json({ notEnoughCoins: true, need: reward.cost, have: p.coins || 0,
          message: `Necesitas ${reward.cost} monedas. Tienes ${p.coins || 0}.` });
      }
      const updated = await Profile.findOneAndUpdate(
        { user: req.user._id, coins: { $gte: reward.cost } },
        { $inc: { coins: -reward.cost, streakFreezes: 1 }, updatedAt: new Date() },
        { new: true }
      ).select("coins streakFreezes").lean();
      return res.json({ success: true, reward, newCoins: updated.coins, streakFreezes: updated.streakFreezes });
    }

    // Atomic: only deduct coins if the item isn't already unlocked AND coins >= cost
    const extraFields = reward.type === "theme" ? { theme: reward.id.replace("theme_", "") } : {};
    const updated = await Profile.findOneAndUpdate(
      { user: req.user._id, unlockedItems: { $ne: reward.id }, coins: { $gte: reward.cost } },
      { $inc: { coins: -reward.cost }, $addToSet: { unlockedItems: reward.id }, ...extraFields, updatedAt: new Date() },
      { new: true }
    ).select("coins unlockedItems").lean();

    if (!updated) {
      // Either already owned or not enough coins — distinguish for UX
      const p = await Profile.findOne({ user: req.user._id }).select("coins unlockedItems").lean();
      if (!p) return res.status(404).json({ message: "Perfil no encontrado" });
      if ((p.unlockedItems || []).includes(reward.id)) return res.json({ success: true, alreadyOwned: true });
      return res.status(403).json({ notEnoughCoins: true, need: reward.cost, have: p.coins || 0,
        message: `Necesitas ${reward.cost} monedas. Tienes ${p.coins || 0}.` });
    }

    res.json({ success: true, reward, newCoins: updated.coins, unlockedItems: updated.unlockedItems });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/equip/:itemId  — equipar badge o marco de perfil */
exports.equipItem = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id }).select("unlockedItems").lean();
    if (!p) return res.status(404).json({ message: "Perfil no encontrado" });
    const item = REWARDS.find(r => r.id === req.params.itemId && (r.type === "badge" || r.type === "frame"));
    if (!item) return res.status(400).json({ message: "Ítem no encontrado" });
    if (!(p.unlockedItems || []).includes(item.id)) {
      return res.status(403).json({ message: "No has desbloqueado este ítem" });
    }
    const field = item.type === "badge" ? "equippedBadge" : "equippedFrame";
    await Profile.findOneAndUpdate({ user: req.user._id }, { [field]: item.id, updatedAt: new Date() });
    res.json({ success: true, [field]: item.id });
  } catch(e) { res.status(500).json({ message: e.message }); }
};
