require("dotenv").config();
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

// ── Seguridad: cabeceras HTTP
app.use(helmet({
  contentSecurityPolicy: false, // SPA con inline scripts requiere ajuste fino
  crossOriginEmbedderPolicy: false,
}));

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
  maxAge: "1d",
  etag: true,
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

app.get("/api/health", (req, res) => res.json({ status: "OK", ai: "Zyra/Groq", version: "5.0" }));
app.get("/api/config", auth, (req, res) => res.json({ ytEnabled: !!process.env.YT_API_KEY }));

// ── Cron: push reminders cada minuto
setInterval(() => {
  require("./controllers/pushController").sendDailyReminders().catch(() => {});
}, 60_000);

// ── SPA fallback
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../client/index.html")));

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

app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("🌊 ════════════════════════════════════");
  console.log("🌊  ZYRA v5.0 — Servidor activo");
  console.log("🌊 ════════════════════════════════════");
  console.log("💻  PC:      http://localhost:" + PORT);
  console.log("📱  CELULAR: http://" + ip + ":" + PORT);
  console.log("🌊 ════════════════════════════════════");
});
