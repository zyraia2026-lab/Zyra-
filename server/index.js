require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const path      = require("path");
const os        = require("os");
const connectDB = require("./config/db");

// ✅ MOVIDO ARRIBA y extraído correctamente
const authModule = require("./middleware/auth");
const auth = typeof authModule === "function" ? authModule : (authModule.auth || authModule.verifyToken || authModule.protect || authModule.default);

const app = express();
connectDB();

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

app.use("/api/auth",          require("./routes/auth"));
app.use("/api/profile",       require("./routes/profile"));
app.use("/api/conversations", require("./routes/conversations"));
app.use("/api/chat",          require("./routes/chat"));
app.use("/api/goals",         require("./routes/goals"));
app.use("/api/journal",       require("./routes/journal"));
app.use("/api/report",        require("./routes/report"));
app.use("/api/gamification",  require("./routes/gamification"));

app.get("/api/health", (req, res) => res.json({ status: "OK", ai: "Zyra/Groq", version: "5.0" }));
app.get("/api/config", auth, (req, res) => res.json({ ytKey: process.env.YT_API_KEY || "" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../client/index.html")));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ message: "Error interno" }); });

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
  console.log("  Copia la URL del CELULAR en Chrome");
  console.log("🌊 ════════════════════════════════════");
});