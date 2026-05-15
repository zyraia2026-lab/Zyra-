const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

router.post("/pdf", protect, async (req, res) => {
  const pythonUrl = process.env.PYTHON_SERVICE || "http://localhost:5000";
  try {
    const Profile      = require("../models/Profile");
    const Conversation = require("../models/Conversation");

    let goals = [];
    try { goals = await require("../models/Goal").find({ user: req.user._id }); } catch(e) {}

    const pd = await Profile.findOne({ user: req.user._id });
    const cd = await Conversation.find({ user: req.user._id });

    const userData = {
      userName: req.user.name,
      sessions: cd.length,
      goals: goals.map(g => ({ title: g.title, completed: g.completed })),
      history: pd?.emotionHistory || [],
      period: "Últimos 30 días"
    };

    const response = await fetch(`${pythonUrl}/report/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=zyra-reporte-${Date.now()}.pdf`);
      return res.send(Buffer.from(buffer));
    }
    res.status(503).json({ message: "Servicio PDF no disponible" });
  } catch(e) {
    console.error("PDF error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;