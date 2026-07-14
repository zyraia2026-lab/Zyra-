require("dotenv").config({ path: require("path").join(__dirname, ".env") });
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
      frameSrc:       ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
      connectSrc:     ["'self'", "https://api.groq.com", "https://api.streamelements.com", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://i.ytimg.com"],
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

app.get("/api/health", (req, res) => res.json({ status: "OK", ai: "Zyra/Groq", version: "5.0" }));
app.get("/api/config", auth, (req, res) => res.json({ ytEnabled: !!process.env.YT_API_KEY }));

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
    const due = await FutureNote.find({ delivered: false, deliverAt: { $lte: now } }).lean();
    for (const note of due) {
      await sendToUser(note.user, {
        title: "📬 Una nota de tu pasado llegó",
        body: note.message.length > 100 ? note.message.slice(0, 97) + "…" : note.message,
        icon: "/Imagenes/icon-192.png",
        badge: "/Imagenes/icon-192.png",
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

// ── SPA fallback — sin caché en index.html
app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

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
