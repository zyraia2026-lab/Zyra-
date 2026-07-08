const r = require("express").Router();
const { protect } = require("../middleware/auth");
const HabitDefinition = require("../models/HabitDefinition");

// GET user's habit definitions
r.get("/", protect, async (req, res) => {
  try {
    const doc = await HabitDefinition.findOne({ user: req.user._id });
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

module.exports = r;
