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
        const msg  = RE_MSGS[Math.floor(Math.random() * RE_MSGS.length)];
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

/* ─── Zyra Proactiva: push iniciado por Zyra según patrones emocionales ─── */
const NEGATIVE_EMOS = new Set(["triste", "ansioso", "enojado", "agotado", "confundido"]);
const DAY_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

exports.sendProactiveCheckIn = async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const now    = new Date();
    const colNow = new Date(now.getTime() - 5 * 60 * 60 * 1000); // UTC-5
    const hour   = colNow.getUTCHours();
    const dow    = colNow.getUTCDay(); // 0=dom … 6=sáb
    const todayStr = colNow.toISOString().slice(0, 10);

    // Solo entre 10:00 y 10:04 Colombia
    if (hour !== 10 || colNow.getUTCMinutes() > 4) return;

    // Usuarios con suscripción push activa
    const subs = await PushSub.find({}).select("user").lean();
    if (!subs.length) return;
    const userIds = subs.map(s => s.user);

    const profiles = await Profile.find({
      user: { $in: userIds },
    }).select("user emotionHistory currentEmotion lastProactiveAt").lean();

    const DEDUP_HOURS = 20;
    let sent = 0;

    for (const p of profiles) {
      // No enviar más de una proactiva cada 20 h
      if (p.lastProactiveAt) {
        const diffH = (now - new Date(p.lastProactiveAt)) / (1000 * 60 * 60);
        if (diffH < DEDUP_HOURS) continue;
      }

      const history = Array.isArray(p.emotionHistory) ? p.emotionHistory : [];

      // ── Detectar patrón día-de-semana negativo ──
      // Buscar registros del mismo día de semana en las últimas 3 semanas
      const sameDoWEntries = history
        .filter(e => {
          const d = new Date(e.date);
          const dc = new Date(d.getTime() - 5 * 60 * 60 * 1000);
          return dc.getUTCDay() === dow && e.date !== todayStr;
        })
        .slice(-3);

      const sameDoWNeg = sameDoWEntries.filter(e => NEGATIVE_EMOS.has(e.emotion)).length;
      const dowPattern = sameDoWNeg >= 2 && sameDoWEntries.length >= 2;

      // ── Detectar racha negativa (3+ días consecutivos) ──
      const recent = [...history].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
      const negStreak = recent.filter(e => NEGATIVE_EMOS.has(e.emotion)).length >= 3;

      // ── Detectar semana emocionalmente positiva (5+ positivas en últimos 7 días) ──
      const POSITIVE_EMOS = new Set(["feliz","tranquilo","esperanzado","motivado"]);
      const weekAgoMs = now.getTime() - 7 * 86400000;
      const weekEntries = history.filter(e => new Date(e.date).getTime() >= weekAgoMs);
      const posWeek = weekEntries.filter(e => POSITIVE_EMOS.has(e.emotion)).length >= 5;

      // ── Construir mensaje ──
      let title, body;
      if (dowPattern) {
        const dayName = DAY_ES[dow];
        const emo     = p.currentEmotion || recent[0]?.emotion;
        if (emo && NEGATIVE_EMOS.has(emo)) {
          title = "Zyra está pensando en ti 💜";
          body  = `Los ${dayName}s últimamente te han estado pesando. ¿Cómo estás hoy? Aquí estoy.`;
        } else {
          title = `Feliz ${dayName} 💙`;
          body  = `¿Cómo arranca este ${dayName}? Cuéntame cuando quieras.`;
        }
      } else if (negStreak) {
        title = "Oye, ¿cómo estás? 💜";
        body  = "Llevas unos días difíciles. No tienes que estarlo sola/o — aquí estoy si quieres hablar.";
      } else if (posWeek) {
        // Semana emocionalmente fuerte — celebrar sin exagerar
        const POS_WEEK_MSGS = [
          "Esta semana has estado bien. En serio. ¿Lo sientes tú también? 🌟",
          "Tu semana ha tenido buena energía. Me alegra verte así 💙",
          "Cinco días con buen ánimo no es casualidad — algo estás haciendo bien 🌿",
        ];
        title = "Qué semana tan buena ✨";
        body  = POS_WEEK_MSGS[Math.floor(Math.random() * POS_WEEK_MSGS.length)];
      } else {
        // Check-in de mañana sin patrón especial — solo enviar a ~30% para no saturar
        if (Math.random() > 0.30) continue;
        const MORNING_MSGS = [
          "Buenos días 🌅 ¿Cómo arranca el día?",
          "Ey, ¿cómo estás hoy? Cuéntame lo que sea 💬",
          "Nuevo día, nueva oportunidad. ¿Cómo te sientes? 💙",
          "¿Qué hay de nuevo? Estoy por acá 💜",
        ];
        title = "Zyra te saluda ✨";
        body  = MORNING_MSGS[Math.floor(Math.random() * MORNING_MSGS.length)];
      }

      await sendToUser(p.user, {
        title,
        body,
        icon:  "/Imagenes/1000154669.png",
        badge: "/Imagenes/1000154669.png",
        tag:   "zyra-proactive",
        data:  { url: "/?p=assistant" },
      });

      await Profile.updateOne({ _id: p._id }, { $set: { lastProactiveAt: now } });
      sent++;
    }
    if (sent) console.log(`[Push] Proactivos enviados: ${sent} usuarios`);
  } catch(e) {
    console.error("[Push] sendProactiveCheckIn error:", e.message);
  }
};

/* ─── Domingo nocturno: reflexión de la semana ─── */
exports.sendSundayReflection = async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const now    = new Date();
    const colNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const hour   = colNow.getUTCHours();
    const dow    = colNow.getUTCDay();
    if (dow !== 0 || hour !== 20 || colNow.getUTCMinutes() > 4) return;

    const subs = await PushSub.find({}).select("user").lean();
    if (!subs.length) return;
    const userIds = subs.map(s => s.user);

    const profiles = await Profile.find({ user: { $in: userIds } })
      .select("user emotionHistory lastSundayReflectionAt streakDays").lean();

    const DEDUP_HOURS = 22;
    const SUNDAY_MSGS = [
      { title: "¿Cómo fue tu semana? 🌙", body: "Tomaste decisiones, viviste momentos. Vale la pena pausar y contarlos." },
      { title: "Cierre de semana 💜", body: "Antes de que llegue el lunes: ¿qué fue lo más valioso de esta semana?" },
      { title: "Una semana más 🌿", body: "¿Qué aprendiste de ti mismo/a esta semana? Tu diario te espera." },
      { title: "Reflexión dominical ✨", body: "Las semanas pasan rápido. Pausa un momento — ¿cómo te fue?" },
    ];

    let sent = 0;
    for (const p of profiles) {
      if (p.lastSundayReflectionAt) {
        const diffH = (now - new Date(p.lastSundayReflectionAt)) / (1000 * 60 * 60);
        if (diffH < DEDUP_HOURS) continue;
      }

      const history = Array.isArray(p.emotionHistory) ? p.emotionHistory : [];
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const weekEntries = history.filter(e => new Date(e.date) >= weekAgo);

      let title, body;
      if (weekEntries.length >= 5) {
        title = "Tu semana en Zyra 📊";
        body  = `Registraste ${weekEntries.length} días esta semana. Tu reporte semanal llega mañana 💜`;
      } else if ((p.streakDays || 0) >= 7) {
        title = `¡${p.streakDays} días seguidos! 🔥`;
        body  = "Una semana más de racha. ¿Cómo cierras el domingo?";
      } else {
        const m = SUNDAY_MSGS[Math.floor(Math.random() * SUNDAY_MSGS.length)];
        title = m.title;
        body  = m.body;
      }

      await sendToUser(p.user, {
        title, body,
        icon:  "/Imagenes/1000154669.png",
        badge: "/Imagenes/1000154669.png",
        tag:   "zyra-sunday",
        data:  { url: "/?p=journal" },
      });

      await Profile.updateOne({ _id: p._id }, { $set: { lastSundayReflectionAt: now } });
      sent++;
    }
    if (sent) console.log(`[Push] Reflexión dominical enviada: ${sent} usuarios`);
  } catch(e) {
    console.error("[Push] sendSundayReflection error:", e.message);
  }
};
