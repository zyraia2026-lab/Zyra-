const r = require("express").Router();
const { protect } = require("../middleware/auth");
const HabitDefinition = require("../models/HabitDefinition");
const HabitLog = require("../models/HabitLog");

function safeParseArr(str) {
  try { const v = JSON.parse(str || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// GET user's habit definitions
r.get("/", protect, async (req, res) => {
  try {
    const doc = await HabitDefinition.findOne({ user: req.user._id }).lean();
    const habits = doc ? safeParseArr(doc.habits) : null;
    res.json({ success: true, habits });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT (upsert) user's habit definitions
r.put("/", protect, async (req, res) => {
  try {
    const { habits } = req.body;
    if (!Array.isArray(habits)) return res.status(400).json({ message: "habits debe ser un array" });
    if (habits.length > 50) return res.status(400).json({ message: "Máximo 50 hábitos permitidos" });
    const sanitized = habits.slice(0, 50).map(h => ({
      id:   String(h.id   || "").substring(0, 50),
      name: String(h.name || "").substring(0, 100),
      icon: String(h.icon || "").substring(0, 10),
      category: String(h.category || "").substring(0, 50),
      frequency: String(h.frequency || "daily").substring(0, 20),
    }));
    await HabitDefinition.findOneAndUpdate(
      { user: req.user._id },
      { habits: JSON.stringify(sanitized), updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET completions for a given date (default: today)
r.get("/log", protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toDateString();
    const log = await HabitLog.findOne({ user: req.user._id, date }).lean();
    res.json({ success: true, completions: log ? safeParseArr(log.completions) : [] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST — sync completions for a date
r.post("/log", protect, async (req, res) => {
  try {
    const { date, completions } = req.body;
    if (!date || typeof date !== "string" || date.length > 50) return res.status(400).json({ message: "Fecha inválida" });
    if (!Array.isArray(completions)) return res.status(400).json({ message: "completions requerido" });
    const safeCompletions = completions.slice(0, 100).map(c => String(c).substring(0, 100));
    await HabitLog.findOneAndUpdate(
      { user: req.user._id, date },
      { completions: JSON.stringify(safeCompletions) },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET last 35 days of logs
r.get("/log/history", protect, async (req, res) => {
  try {
    const logs = await HabitLog.find({ user: req.user._id }).limit(35).lean();
    // Sort by actual date value (string format "Mon Jul 14 2026" is not lexicographically sortable)
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, logs: logs.map(l => ({ date: l.date, completions: safeParseArr(l.completions) })) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = r;
