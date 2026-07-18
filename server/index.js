require("dotenv").config({ path: require("path").join(__dirname, ".env") });

// ── Sentry: inicializar ANTES de todo lo demás para capturar errores de startup
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.2,
      beforeSend(event) {
        // No enviar errores de rate-limit o auth (demasiado ruido)
        if (event.exception?.values?.[0]?.type === "UnauthorizedError") return null;
        return event;
      },
    });
    console.log("🔍 Sentry conectado");
  } catch(e) { console.log("Sentry no disponible:", e.message); }
}

const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const compression   = require("compression");
const path       = require("path");
const os         = require("os");
const connectDB  = require("./config/db");

const authModule = require("./middleware/auth");
const auth = typeof authModule === "function" ? authModule : (authModule.auth || authModule.verifyToken || authModule.protect || authModule.default);

const app = express();
connectDB();

// ── Confiar en el proxy de Render/Nginx para rate limiting correcto
app.set("trust proxy", 1);

// ── Sentry request tracking (debe ir antes de los otros middlewares)
if (Sentry) app.use(Sentry.Handlers.requestHandler());

// ── Seguridad: cabeceras HTTP
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  // Permitir compute-pressure para iframes de YouTube (base.js lo necesita para optimizar reproducción)
  permissionsPolicy: {
    features: {
      computePressure: ["*"],
      autoplay:        ["*"],
      fullscreen:      ["*"],
    }
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://s.ytimg.com"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:         ["'self'", "data:", "https:", "blob:"],
      mediaSrc:       ["'self'", "https:", "blob:"],
      frameSrc:       ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://open.spotify.com"],
      connectSrc:     ["'self'", "https://api.groq.com", "https://api.streamelements.com", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://api.spotify.com", "https://accounts.spotify.com"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// ── Ocultar versión de Express
app.disable("x-powered-by");

// ── CORS: restringir a dominio propio en producción
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:438", "http://localhost:3000"];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
      cb(null, true);
    } else {
      cb(new Error("CORS: origen no permitido"));
    }
  },
  credentials: true,
}));

// ── Performance: gzip
app.use(compression());

// ── Webhook de Stripe ANTES de parsear JSON
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), require("./controllers/paymentController").webhook);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// ── Sanitizar MongoDB injection ($where, $gt, etc.)
app.use(mongoSanitize());

app.use(express.static(path.join(__dirname, "../client"), {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".apk")) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", 'attachment; filename="Zyra.apk"');
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));

app.use("/api/auth",          require("./routes/auth"));
app.use("/api/auth",          require("./routes/oauth"));
app.use("/api/profile",       require("./routes/profile"));
app.use("/api/conversations", require("./routes/conversations"));
app.use("/api/chat",          require("./routes/chat"));
app.use("/api/goals",         require("./routes/goals"));
app.use("/api/journal",       require("./routes/journal"));
app.use("/api/report",        require("./routes/report"));
app.use("/api/gamification",  require("./routes/gamification"));
app.use("/api/payments",      require("./routes/payments"));
app.use("/api/tts",           require("./routes/tts"));
app.use("/api/push",          require("./routes/push"));
app.use("/api/yt",            require("./routes/yt"));
app.use("/api/memory",        require("./routes/memory"));
app.use("/api/analytics",     require("./routes/analytics"));
app.use("/api/habits",        require("./routes/habits"));
app.use("/api/weekly-report", require("./routes/weeklyReport"));
app.use("/api/referral",      require("./routes/referral"));
app.use("/api/future-notes",  require("./routes/futureNotes"));
app.use("/api/admin",         require("./routes/admin"));
app.use("/api/spotify",       require("./routes/spotify"));

app.get("/api/health", (req, res) => res.json({ status: "OK", ai: "Zyra/Groq", version: "5.0" }));
app.get("/api/config", auth, (req, res) => res.json({
  ytEnabled:      !!process.env.YT_API_KEY,
  spotifyEnabled: !!process.env.SPOTIFY_CLIENT_ID,
}));

// ── Cron: push reminders cada minuto
setInterval(() => {
  require("./controllers/pushController").sendDailyReminders().catch(() => {});
}, 60_000);

// ── Cron: reportes semanales cada lunes a las 9:00am exacto
setInterval(() => {
  const now = new Date();
  if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() === 0) {
    require("./controllers/weeklyReportController").cronGenerateAll().catch(() => {});
  }
}, 60_000);

// ── Cron: entregar notas del futuro cada hora
setInterval(async () => {
  try {
    const FutureNote = require("./models/FutureNote");
    const { sendToUser } = require("./controllers/pushController");
    const now = new Date();
    const due = await FutureNote.find({ delivered: false, deliverAt: { $lte: now } }).limit(200).lean();
    for (const note of due) {
      await sendToUser(note.user, {
        title: "📬 Una nota de tu pasado llegó",
        body: note.message.length > 100 ? note.message.slice(0, 97) + "…" : note.message,
        icon: "/Imagenes/1000154669.png",
        badge: "/Imagenes/1000154669.png",
        tag: "zyra-future-note",
        data: { url: "/?p=journal" },
      });
      await FutureNote.updateOne({ _id: note._id }, { delivered: true, deliveredAt: now });
    }
    if (due.length) console.log(`[FutureNotes] Entregadas: ${due.length}`);
  } catch(e) { console.error("[FutureNotes] cron error:", e.message); }
}, 60 * 60_000);

// ── Cron: auto-expirar planes vencidos cada hora
setInterval(async () => {
  try {
    const User = require("./models/User");
    const result = await User.updateMany(
      { plan: { $ne: "free" }, planExpiresAt: { $lt: new Date() } },
      { $set: { plan: "free", planExpiresAt: null } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[cron] Auto-expired ${result.modifiedCount} plan(s)`);
    }
  } catch(e) {
    console.error("[cron] plan-expiry:", e.message);
  }
}, 60 * 60_000);

// ── Política de privacidad (requerida por Facebook/Google OAuth)
app.get("/privacy", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Política de Privacidad — Zyra</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1a1a2e;line-height:1.7}h1{color:#6366f1}h2{color:#4f46e5;margin-top:32px}a{color:#6366f1}</style></head><body>
<h1>Política de Privacidad de Zyra</h1>
<p><em>Última actualización: julio de 2026</em></p>
<p>Zyra ("nosotros", "la app") es una aplicación de bienestar emocional con inteligencia artificial. Esta política explica cómo tratamos tu información personal.</p>
<h2>1. Datos que recopilamos</h2>
<ul><li>Nombre y correo electrónico (para crear tu cuenta)</li><li>Mensajes del chat con Zyra (para personalizar las respuestas)</li><li>Entradas del diario y metas (solo visibles para ti)</li><li>Preferencias de uso como tema visual y recordatorios</li></ul>
<h2>2. Cómo usamos tus datos</h2>
<p>Usamos tu información exclusivamente para brindarte el servicio: respuestas personalizadas de la IA, historial de conversaciones y funciones de bienestar. Nunca vendemos tus datos a terceros.</p>
<h2>3. Inicio de sesión con redes sociales</h2>
<p>Si inicias sesión con Google, Spotify o Facebook, solo obtenemos tu nombre, correo y foto de perfil del proveedor para crear o acceder a tu cuenta en Zyra. No accedemos a tus publicaciones, amigos ni otra información de tu perfil social.</p>
<h2>4. Almacenamiento y seguridad</h2>
<p>Tus datos se almacenan de forma segura en servidores encriptados. Usamos HTTPS en todas las comunicaciones. Las contraseñas se guardan con hash bcrypt.</p>
<h2>5. Tus derechos</h2>
<p>Puedes solicitar la eliminación de tu cuenta y todos tus datos en cualquier momento escribiéndonos a <a href="mailto:zyra.ia.2026@gmail.com">zyra.ia.2026@gmail.com</a>. Procesamos las solicitudes en un máximo de 30 días.</p>
<h2>6. Eliminación de datos</h2>
<p>Para eliminar todos tus datos de Zyra, envía un correo a <a href="mailto:zyra.ia.2026@gmail.com">zyra.ia.2026@gmail.com</a> con el asunto "Eliminar mis datos" o usa la opción de eliminar cuenta dentro de la app. También puedes visitar: <a href="https://zyra-app-8qva.onrender.com/privacy#delete">zyra-app-8qva.onrender.com/privacy#delete</a></p>
<h2 id="delete">7. Solicitud de eliminación de datos de Facebook</h2>
<p>Si conectaste tu cuenta de Facebook a Zyra y deseas que eliminemos la información asociada, escríbenos a <a href="mailto:zyra.ia.2026@gmail.com">zyra.ia.2026@gmail.com</a> indicando tu nombre de usuario de Facebook. Procesamos todas las solicitudes de eliminación en un plazo máximo de 30 días.</p>
<h2>8. Contacto</h2>
<p>Para cualquier pregunta sobre privacidad: <a href="mailto:zyra.ia.2026@gmail.com">zyra.ia.2026@gmail.com</a></p>
<p style="margin-top:40px;padding-top:20px;border-top:1px solid #eee;color:#888;font-size:13px">© 2026 Zyra — App de bienestar emocional con IA</p>
</body></html>`);
});

// ── SPA fallback — sin caché en index.html
app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ── Sentry error handler (debe ir ANTES del error handler propio)
if (Sentry) app.use(Sentry.Handlers.errorHandler());

// ── Error handler global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Error interno" : err.message });
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

const PORT = process.env.PORT || 438;

// ── Keep-alive: ping propio cada 13 min para evitar sleep en Render free tier
if (process.env.NODE_ENV === "production") {
  const SELF = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    fetch(`${SELF}/api/health`).catch(() => {});
  }, 13 * 60 * 1000);
}

const server = app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("🌊 ════════════════════════════════════");
  console.log("🌊  ZYRA v5.0 — Servidor activo");
  console.log("🌊 ════════════════════════════════════");
  console.log("💻  PC:      http://localhost:" + PORT);
  console.log("📱  CELULAR: http://" + ip + ":" + PORT);
  console.log("🌊 ════════════════════════════════════");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`⚠️  Puerto ${PORT} ocupado — matando proceso anterior...`);
    const { execSync } = require("child_process");
    try {
      if (process.platform === "win32") {
        const out = execSync(`netstat -ano | findstr :${PORT}`).toString();
        const match = out.match(/LISTENING\s+(\d+)/);
        if (match) { execSync(`taskkill /F /PID ${match[1]}`); console.log(`✅ Proceso ${match[1]} terminado`); }
      } else {
        execSync(`fuser -k ${PORT}/tcp`);
      }
      // Crear servidor nuevo en lugar de reusar el que falló
      setTimeout(() => {
        const newServer = app.listen(PORT, "0.0.0.0", () => {
          console.log(`✅ Servidor reiniciado en puerto ${PORT}`);
        });
        newServer.on("error", (e) => console.error("Error al reiniciar:", e.message));
      }, 600);
    } catch(e) {
      console.error("No se pudo liberar el puerto:", e.message);
      process.exit(1);
    }
  } else {
    console.error("Error de servidor:", err.message);
  }
});

// ── Evitar que el proceso muera por errores no capturados ──
process.on("uncaughtException", (err) => {
  console.error("⚠️  uncaughtException (proceso sigue vivo):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("⚠️  unhandledRejection (proceso sigue vivo):", reason?.message || reason);
});
