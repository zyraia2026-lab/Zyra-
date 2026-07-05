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
  try {
    const now  = new Date();
    const hour = now.getHours();
    const min  = now.getMinutes();

    const profiles = await Profile.find({
      reminderEnabled: true,
      reminderHour:    hour,
      reminderMinute:  { $gte: min - 1, $lte: min + 1 },
    }).select("user");

    const MESSAGES = [
      "¿Cómo estás hoy? Zyra te está esperando 💜",
      "Un momento contigo misma puede cambiarlo todo 🌟",
      "Tu bienestar importa. Hablemos un momento 💬",
      "Zyra quiere saber cómo te fue hoy 🌙",
    ];

    for (const p of profiles) {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      await sendToUser(p.user, {
        title: "Hola, soy Zyra 💜",
        body:  msg,
        icon:  "/Imagenes/icon-192.png",
        badge: "/Imagenes/icon-192.png",
        data:  { url: "/?p=assistant" },
      });
    }
    if (profiles.length) console.log(`[Push] Recordatorios enviados: ${profiles.length}`);
  } catch(e) {
    console.error("[Push] sendDailyReminders error:", e.message);
  }
};
