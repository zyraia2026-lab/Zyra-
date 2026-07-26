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
    if (!subscription?.endpoint || typeof subscription.endpoint !== "string") return res.status(400).json({ message: "Suscripción inválida" });
    if (!subscription.endpoint.startsWith("https://")) return res.status(400).json({ message: "Endpoint inválido" });
    if (subscription.endpoint.length > 512) return res.status(400).json({ message: "Endpoint demasiado largo" });
    if (!subscription.keys || typeof subscription.keys.auth !== "string" || typeof subscription.keys.p256dh !== "string") return res.status(400).json({ message: "Claves de suscripción inválidas" });
    const sub = { endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth.substring(0, 100), p256dh: subscription.keys.p256dh.substring(0, 200) } };
    await PushSub.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, subscription: sub },
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
  const sub = await PushSub.findOne({ user: userId }).select("subscription").lean();
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

/* Mensajes según última emoción registrada */
const EMO_MESSAGES = {
  feliz:       ["Qué bueno que estás bien hoy 😊 ¿Qué fue lo mejor del día?", "Me alegra saber que estás feliz 💛 Cuéntame qué pasó.", "Días así merecen ser recordados. ¿Lo anotaste en tu diario? 📖"],
  tranquilo:   ["La calma también merece atención 😌 ¿Cómo vas?", "Estar tranquilo es un regalo. ¿Qué te lo está dando hoy? 🌿", "¿Todo bien por allá? Estoy por si quieres hablar 💜"],
  ansioso:     ["Sé que la ansiedad puede ser difícil. Respira, aquí estoy 💙", "¿Cómo va esa ansiedad? Puedo ayudarte a calmarla un poco 🌬️", "Oye — el ejercicio de respiración tarda 2 minutos. ¿Lo hacemos? 🧘"],
  triste:      ["Sé que hoy no es el mejor día. Estoy contigo 💙", "No tienes que estar bien siempre. ¿Quieres contarme cómo te sientes? 🤍", "La tristeza también pasa. ¿Cómo estás ahorita? 💜"],
  enojado:     ["El enojo avisa que algo importa. ¿Qué está pasando? 💬", "¿Mejor ya? Cuando quieras hablar de lo que pasó, aquí estoy 💙", "Respira. Después cuéntame 🌿"],
  confundido:  ["La confusión es parte del proceso. ¿Te puedo ayudar a ordenar ideas? 💡", "No siempre hay que tener todo claro. ¿Cómo te sientes ahora? 💜", "Aquí estoy si quieres hablar de lo que te tiene en mente 💬"],
  esperanzado: ["Esa esperanza que sientes es tuya — cuídala 🌟", "Me encanta cuando estás así de bien 😊 ¿Qué viene hoy?", "La esperanza es poderosa. ¿Qué te está dando esperanza? ✨"],
  agotado:     ["El cansancio también habla. ¿Qué necesitas hoy? 🌙", "Descansar es productivo también. ¿Cómo vas? 💙", "Oye — ¿ya tomaste agua? A veces eso ayuda 💧"],
  motivado:    ["¡Ese es el ánimo! ¿Qué vas a lograr hoy? 💪", "Esa motivación es gasolina — dale uso antes de que se acabe 🚀", "¿En qué andas con esa energía? Cuéntame 💬"],
  nostalgico:  ["Los recuerdos también forman parte de ti 🌅", "A veces el pasado visita sin avisar. ¿Estás bien? 💙", "¿Qué te está recordando hoy? Puedes contarme 💜"],
};

const GENERIC_MESSAGES = [
  "Ey, ¿cómo vas hoy? Cuéntame 💙",
  "Llevo un rato sin saber de ti. ¿Todo bien? 🌿",
  "Acá estoy cuando quieras hablar 💜",
  "¿Cómo terminó el día? Quiero saber 🌙",
  "¿Qué tal estuvo hoy? 💬",
  "Oye, te estoy pensando. ¿Cómo estás? 💙",
];

/* Cron diario: enviar recordatorios a usuarios con reminder activado */
exports.sendDailyReminders = async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const Goal = require("../models/Goal");
  try {
    const now  = new Date();
    // Convertir a hora Colombia (UTC-5) porque los usuarios guardan su hora local
    const hour = (now.getUTCHours() + 19) % 24;   // +19 = -5 en módulo 24
    const min  = now.getUTCMinutes();

    // ── 1. Recordatorio diario personalizado (con emoción) ──
    const profiles = await Profile.find({
      reminderEnabled: true,
      reminderHour:    hour,
      reminderMinute:  min,
    }).select("user lastReminderSentAt currentEmotion").lean();

    const DEDUP_MS = 50 * 60 * 1000;
    let sent = 0;
    for (const p of profiles) {
      if (p.lastReminderSentAt && (now - new Date(p.lastReminderSentAt)) < DEDUP_MS) continue;
      const pool = p.currentEmotion && EMO_MESSAGES[p.currentEmotion] ? EMO_MESSAGES[p.currentEmotion] : GENERIC_MESSAGES;
      const msg  = pool[Math.floor(Math.random() * pool.length)];
      await sendToUser(p.user, {
        title: "Zyra te habló 💜",
        body:  msg,
        icon:  "/Imagenes/1000154669.png",
        badge: "/Imagenes/1000154669.png",
        tag:   "zyra-daily",
        data:  { url: "/?p=assistant" },
      });
      await Profile.updateOne({ _id: p._id }, { lastReminderSentAt: now });
      sent++;
    }
    if (sent) console.log(`[Push] Recordatorios enviados: ${sent}`);

    // ── 2. Re-engagement: usuarios inactivos 2+ días con push sub ──
    if (hour === 18 && min < 5) {
      const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const inactiveProfiles = await Profile.find({
        lastActiveDate:  { $lt: twoDaysAgo },
        reminderEnabled: { $ne: true },
      }).select("user currentEmotion lastActiveDate").limit(200).lean();

      const activeSubs = await PushSub.find({
        user: { $in: inactiveProfiles.map(p => p.user) },
      }).select("user").lean();

      const subUserIds = new Set(activeSubs.map(s => s.user.toString()));
      const RE_MSGS = [
        "Te extrañamos por aquí. ¿Cómo has estado? 💜",
        "Han pasado unos días sin verte. ¿Todo bien? 🌿",
        "Siempre hay un lugar para ti aquí. Cuando quieras, te espero 💙",
        "¿Cómo te has sentido estos días? Cuéntame 💬",
      ];

      let reSent = 0;
      for (const p of inactiveProfiles) {
        if (!subUserIds.has(p.user.toString())) continue;
        const pool = p.currentEmotion && EMO_MESSAGES[p.currentEmotion] ? EMO_MESSAGES[p.currentEmotion] : RE_MSGS;
        const msg  = pool[Math.floor(Math.random() * pool.length)];
        await sendToUser(p.user, {
          title: "Zyra te extraña 💜",
          body:  msg,
          icon:  "/Imagenes/1000154669.png",
          badge: "/Imagenes/1000154669.png",
          tag:   "zyra-reengagement",
          data:  { url: "/?p=assistant" },
        });
        reSent++;
      }
      if (reSent) console.log(`[Push] Re-engagement enviado: ${reSent} usuarios`);
    }

    // ── 3. Alertas de metas que vencen hoy o mañana (solo a las 9am) ──
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
            icon:  "/Imagenes/1000154669.png",
            badge: "/Imagenes/1000154669.png",
            tag:   "zyra-goals",
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
