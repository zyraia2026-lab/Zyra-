const Profile = require("../models/Profile");

/* ════════════════════════════════════════
   CATÁLOGOS ESTÁTICOS
════════════════════════════════════════ */
const DAILY_MISSIONS = [
  { id: "log_emotion",   label: "Registra tu emoción del día",   emoji: "😊", coins: 10 },
  { id: "write_journal", label: "Escribe en tu diario",           emoji: "📔", coins: 15 },
  { id: "chat_zyra",     label: "Habla con Zyra (5+ mensajes)",  emoji: "💬", coins: 20 },
  { id: "do_exercise",   label: "Haz un ejercicio de bienestar", emoji: "🧘", coins: 15 },
  { id: "check_goals",   label: "Revisa tus metas",               emoji: "🎯", coins: 10 },
];

const ACHIEVEMENTS = [
  { id: "first_login",  label: "Primer paso",      emoji: "🌱", desc: "Abriste Zyra por primera vez" },
  { id: "streak_3",     label: "En racha",          emoji: "🔥", desc: "3 días seguidos con Zyra" },
  { id: "streak_7",     label: "Una semana",        emoji: "⚡", desc: "7 días seguidos" },
  { id: "streak_14",    label: "Dos semanas",       emoji: "🌙", desc: "14 días seguidos" },
  { id: "streak_30",    label: "Un mes entero",     emoji: "👑", desc: "30 días seguidos" },
  { id: "coins_50",     label: "Primera cosecha",   emoji: "🌾", desc: "Acumulaste 50 monedas" },
  { id: "coins_200",    label: "Coleccionista",     emoji: "💰", desc: "Acumulaste 200 monedas" },
  { id: "all_missions", label: "Día perfecto",      emoji: "🌟", desc: "Completaste todas las misiones del día" },
  { id: "journal_10",   label: "Escritor",          emoji: "📚", desc: "10 entradas en el diario" },
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
];

exports.DAILY_MISSIONS = DAILY_MISSIONS;
exports.ACHIEVEMENTS   = ACHIEVEMENTS;
exports.REWARDS        = REWARDS;

/* ── helpers ── */
function isMissionsReset(p) {
  const reset = p.missionsResetAt ? new Date(p.missionsResetAt) : null;
  if (!reset) return true;
  return reset.toDateString() !== new Date().toDateString();
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
    let p = await Profile.findOne({ user: req.user._id });
    if (!p) p = await Profile.create({ user: req.user._id });

    const needsReset = isMissionsReset(p);
    const completedToday = needsReset ? [] : (p.missionsCompletedToday || []);

    const missions = DAILY_MISSIONS.map(m => ({
      ...m,
      completed: completedToday.includes(m.id),
    }));

    res.json({
      success: true,
      streak:        p.streakDays || 0,
      coins:         p.coins || 0,
      equippedBadge: p.equippedBadge || "",
      missions,
      missionsCompleted: completedToday.length,
      missionsTotal:     DAILY_MISSIONS.length,
      achievements: ACHIEVEMENTS.map(a => ({ ...a, earned: (p.achievements || []).includes(a.id) })),
      rewards:      REWARDS.map(r => ({ ...r, unlocked: (p.unlockedItems || []).includes(r.id) })),
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/visit  — llamar al abrir la app (actualiza racha) */
exports.recordVisit = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id });
    if (!p) p = await Profile.create({ user: req.user._id });

    const now  = new Date();
    const last = p.lastActiveDate ? new Date(p.lastActiveDate) : null;
    const diff = last ? Math.floor((now - last) / 86400000) : null;

    let streak = p.streakDays || 0;
    let coinsEarned = 0;

    if (diff === null || diff > 1) {
      streak = 1; // reset o primer día
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
    // Reset misiones si es nuevo día
    if (isMissionsReset(p)) {
      update.missionsCompletedToday = [];
      update.missionsResetAt = now;
    }

    await Profile.findOneAndUpdate({ user: req.user._id }, update);

    res.json({
      success: true,
      streak,
      coinsEarned: coinsEarned + achBonus,
      newAchievements: fresh.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean),
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/mission/:id  — completar una misión */
exports.completeMission = async (req, res) => {
  try {
    const mission = DAILY_MISSIONS.find(m => m.id === req.params.id);
    if (!mission) return res.status(400).json({ message: "Misión desconocida" });

    let p = await Profile.findOne({ user: req.user._id });
    if (!p) p = await Profile.create({ user: req.user._id });

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
      coins:                  finalCoins,
      missionsCompletedToday: newCompleted,
      achievements:           earned,
      updatedAt:              new Date(),
    };
    if (needsReset) update.missionsResetAt = new Date();

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

    let p = await Profile.findOne({ user: req.user._id });
    if (!p) return res.status(404).json({ message: "Perfil no encontrado" });

    if ((p.unlockedItems || []).includes(reward.id)) {
      return res.json({ success: true, alreadyOwned: true });
    }
    if ((p.coins || 0) < reward.cost) {
      return res.status(403).json({ notEnoughCoins: true, need: reward.cost, have: p.coins || 0,
        message: `Necesitas ${reward.cost} monedas. Tienes ${p.coins || 0}.` });
    }

    const newUnlocked = [...(p.unlockedItems || []), reward.id];
    const newCoins    = (p.coins || 0) - reward.cost;
    const update      = { coins: newCoins, unlockedItems: newUnlocked, updatedAt: new Date() };
    if (reward.type === "theme") update.theme = reward.id.replace("theme_", "");

    await Profile.findOneAndUpdate({ user: req.user._id }, update);
    res.json({ success: true, reward, newCoins, unlockedItems: newUnlocked });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/gamification/equip/:itemId  — equipar badge */
exports.equipItem = async (req, res) => {
  try {
    let p = await Profile.findOne({ user: req.user._id });
    if (!p) return res.status(404).json({ message: "Perfil no encontrado" });
    const item = REWARDS.find(r => r.id === req.params.itemId && r.type === "badge");
    if (!item) return res.status(400).json({ message: "Ítem no encontrado" });
    if (!(p.unlockedItems || []).includes(item.id)) {
      return res.status(403).json({ message: "No has desbloqueado este ítem" });
    }
    await Profile.findOneAndUpdate({ user: req.user._id }, { equippedBadge: item.id, updatedAt: new Date() });
    res.json({ success: true, equippedBadge: item.id });
  } catch(e) { res.status(500).json({ message: e.message }); }
};
