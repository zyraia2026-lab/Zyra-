const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const ytLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: { message: "Demasiadas búsquedas. Espera un momento." },
  standardHeaders: true, legacyHeaders: false,
});

// GET /api/yt/search?q=...&maxResults=1
r.get("/search", protect, ytLimiter, async (req, res) => {
  try {
    const key = process.env.YT_API_KEY;
    if (!key) return res.status(503).json({ message: "YouTube no configurado" });
    const { q = "", maxResults = 1, videoCategoryId = "" } = req.query;
    if (!q.trim()) return res.status(400).json({ message: "Query requerida" });

    const params = new URLSearchParams({
      part: "snippet", q, type: "video", maxResults,
      key,
      ...(videoCategoryId ? { videoCategoryId } : {}),
    });
    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data  = await ytRes.json();
    if (data.error) return res.status(502).json({ message: data.error.message });
    res.json(data);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/yt/videos?ids=id1,id2
r.get("/videos", protect, ytLimiter, async (req, res) => {
  try {
    const key = process.env.YT_API_KEY;
    if (!key) return res.status(503).json({ message: "YouTube no configurado" });
    const { ids = "" } = req.query;
    if (!ids.trim()) return res.status(400).json({ message: "IDs requeridos" });

    const params = new URLSearchParams({ part: "status,snippet", id: ids, key });
    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data  = await ytRes.json();
    if (data.error) return res.status(502).json({ message: data.error.message });
    res.json(data);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = r;
