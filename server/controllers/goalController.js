const Goal = require("../models/Goal");
const { getPlan } = require("../middleware/planGate");

exports.getGoals = async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, goals });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createGoal = async (req, res) => {
  try {
    const { title, category, reminder, dueDate, priority } = req.body;
    if (!title) return res.status(400).json({ message: "El título es requerido" });

    const { limits } = getPlan(req.user);
    if (limits.goals !== Infinity) {
      const count = await Goal.countDocuments({ user: req.user._id, completed: false });
      if (count >= limits.goals) {
        return res.status(403).json({
          limitReached: true,
          plan: req.user.plan || "free",
          limit: limits.goals,
          message: `Tu plan permite un máximo de ${limits.goals} metas activas. Actualiza tu plan o completa una meta existente.`,
        });
      }
    }

    const goal = await Goal.create({ user: req.user._id, title, category, reminder, dueDate, priority });
    res.status(201).json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.toggleGoal = async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ message: "No encontrada" });
    goal.completed = !goal.completed;
    await goal.save();
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateGoal = async (req, res) => {
  try {
    const { title, category, reminder, dueDate, priority, progress } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "El título es requerido" });
    const upd = { title: title.trim(), category, reminder, dueDate: dueDate || null, priority, updatedAt: new Date() };
    if (typeof progress === "number") upd.progress = Math.min(100, Math.max(0, progress));
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      upd,
      { new: true }
    );
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteGoal = async (req, res) => {
  try {
    await Goal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.addGoalNote = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "El texto de la nota es requerido" });
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    goal.notes.push({ text: text.trim(), date: new Date() });
    await goal.save();
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteGoalNote = async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    goal.notes = goal.notes.filter(n => n._id.toString() !== req.params.noteId);
    await goal.save();
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
