const webpush      = require("web-push");
const PushSub      = require("../models/PushSubscription");
const Profile      = require("../models/Profile");
const User         = require("../models/User");

// Generar VAPID keys una sola vez: node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
// y agregar al .env como VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || "mailto:soporte@zyra.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("🔔 Web Push configurado");
} else {
  console.log("⚠️  VAPID keys no configuradas — push notifications deshabilitadas");
}

/* GET /api/push/key — devuelve la clave pública VAPID al cliente */
exports.getPublicKey = (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ message: "Push no configurado" });
  res.json({ publicKey: VAPID_PUBLIC });
};

/* POST /api/push/subscribe — guarda/actualiza suscripción del dispositivo */
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ message: "Suscripción inválida" });
    await PushSub.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, subscription },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* DELETE /api/push/subscribe — desuscribir */
exports.unsubscribe = async (req, res) => {
  try {
    await PushSub.deleteOne({ user: req.user._id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* Enviar notificación a un usuario específico */
async function sendToUser(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const sub = await PushSub.findOne({ user: userId });
  if (!sub) return;
  try {
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
  } catch(e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      await PushSub.deleteOne({ user: userId });
    } else {
      console.warn("[Push] Error enviando a", userId, e.message);
    }
  }
}
exports.sendToUser = sendToUser;

/* Cron diario: enviar recordatorios a usuarios con reminder activado */
exports.sendDailyReminders = async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const Goal = require("../models/Goal");
  try {
    const now  = new Date();
    const hour = now.getHours();
    const min  = now.getMinutes();

    // ── 1. Recordatorio diario personalizado ──
    const profiles = await Profile.find({
      reminderEnabled: true,
      reminderHour:    hour,
      reminderMinute:  min,
    }).select("user lastReminderSentAt");

    const MESSAGES = [
      "Ey, ¿cómo vas hoy? Cuéntame 💙",
      "Llevo un rato sin saber de ti. ¿Todo bien? 🌿",
      "Acá estoy cuando quieras hablar 💜",
      "¿Cómo terminó el día? Quiero saber 🌙",
      "¿Qué tal estuvo hoy? 💬",
      "Oye, te estoy pensando. ¿Cómo estás? 💙",
    ];

    const DEDUP_MS = 50 * 60 * 1000;
    let sent = 0;
    for (const p of profiles) {
      if (p.lastReminderSentAt && (now - new Date(p.lastReminderSentAt)) < DEDUP_MS) continue;
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      await sendToUser(p.user, {
        title: "Zyra te habló 💜",
        body:  msg,
        icon:  "/Imagenes/icon-192.png",
        badge: "/Imagenes/icon-192.png",
        data:  { url: "/?p=assistant" },
      });
      await Profile.updateOne({ _id: p._id }, { lastReminderSentAt: now });
      sent++;
    }
    if (sent) console.log(`[Push] Recordatorios enviados: ${sent}`);

    // ── 2. Alertas de metas que vencen hoy o mañana (solo a las 9am) ──
    if (hour === 9 && min < 5) {
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(todayStart); tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

      const dueGoals = await Goal.find({
        completed: false,
        dueDate:   { $gte: todayStart, $lt: tomorrowEnd },
      }).select("user title dueDate").lean();

      if (dueGoals.length) {
        // Agrupar por usuario
        const byUser = {};
        dueGoals.forEach(g => {
          const uid = g.user.toString();
          if (!byUser[uid]) byUser[uid] = { today: [], tomorrow: [] };
          const d = new Date(g.dueDate);
          d.setHours(23, 59, 59, 999);
          if (d < tomorrowEnd && d >= todayStart) {
            const isToday = d.toDateString() === now.toDateString();
            (isToday ? byUser[uid].today : byUser[uid].tomorrow).push(g.title);
          }
        });

        let goalNotifs = 0;
        for (const [uid, { today, tomorrow }] of Object.entries(byUser)) {
          const todayPart  = today.length  ? `Hoy: ${today.slice(0,2).map(t=>`"${t}"`).join(", ")}${today.length>2?` y ${today.length-2} más`:""}` : "";
          const tomorPart  = tomorrow.length ? `Mañana: ${tomorrow.slice(0,2).map(t=>`"${t}"`).join(", ")}${tomorrow.length>2?` y ${tomorrow.length-2} más`:""}` : "";
          const body = [todayPart, tomorPart].filter(Boolean).join(" · ");
          await sendToUser(uid, {
            title: today.length ? "⚠️ Meta que vence hoy" : "🔔 Meta que vence mañana",
            body,
            icon:  "/Imagenes/icon-192.png",
            badge: "/Imagenes/icon-192.png",
            data:  { url: "/?p=goals" },
          });
          goalNotifs++;
        }
        if (goalNotifs) console.log(`[Push] Alertas de metas enviadas: ${goalNotifs} usuarios`);
      }
    }
  } catch(e) {
    console.error("[Push] sendDailyReminders error:", e.message);
  }
};
