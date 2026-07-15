const r = require("express").Router();
const { protect } = require("../middleware/auth");
const HabitDefinition = require("../models/HabitDefinition");
const HabitLog = require("../models/HabitLog");

// GET user's habit definitions
r.get("/", protect, async (req, res) => {
  try {
    const doc = await HabitDefinition.findOne({ user: req.user._id }).lean();
    const habits = doc ? JSON.parse(doc.habits || "[]") : null;
    res.json({ success: true, habits });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT (upsert) user's habit definitions
r.put("/", protect, async (req, res) => {
  try {
    const { habits } = req.body;
    if (!Array.isArray(habits)) return res.status(400).json({ message: "habits must be an array" });
    await HabitDefinition.findOneAndUpdate(
      { user: req.user._id },
      { habits: JSON.stringify(habits), updatedAt: new Date() },
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
    res.json({ success: true, completions: log ? JSON.parse(log.completions || "[]") : [] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST — sync completions for a date
r.post("/log", protect, async (req, res) => {
  try {
    const { date, completions } = req.body;
    if (!date || !Array.isArray(completions)) return res.status(400).json({ message: "date and completions required" });
    await HabitLog.findOneAndUpdate(
      { user: req.user._id, date },
      { completions: JSON.stringify(completions) },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET last 30 days of logs
r.get("/log/history", protect, async (req, res) => {
  try {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const logs = await HabitLog.find({ user: req.user._id }).sort({ date: -1 }).limit(35).lean();
    res.json({ success: true, logs: logs.map(l => ({ date: l.date, completions: JSON.parse(l.completions || "[]") })) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = r;
