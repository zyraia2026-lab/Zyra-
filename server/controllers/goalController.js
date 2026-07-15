const Goal = require("../models/Goal");
const { getPlan } = require("../middleware/planGate");

exports.getGoals = async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, goals });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createGoal = async (req, res) => {
  try {
    const { category, reminder, dueDate, priority } = req.body;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "El título es requerido" });
    if (title.length > 200) return res.status(400).json({ message: "Título demasiado largo (máx. 200 caracteres)" });

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

    const goal = await Goal.create({ user: req.user._id, title: title.substring(0,200), category, reminder, dueDate, priority });
    res.status(201).json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.toggleGoal = async (req, res) => {
  try {
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      [{ $set: { completed: { $not: "$completed" }, updatedAt: "$$NOW" } }],
      { new: true }
    ).lean();
    if (!goal) return res.status(404).json({ message: "No encontrada" });
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
    ).lean();
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteGoal = async (req, res) => {
  try {
    const { deletedCount } = await Goal.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!deletedCount) return res.status(404).json({ message: "Meta no encontrada" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.addGoalNote = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "El texto de la nota es requerido" });
    if (text.length > 1000) return res.status(400).json({ message: "Nota demasiado larga (máx. 1000 caracteres)" });
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { notes: { text: text.substring(0,1000), date: new Date() } }, updatedAt: new Date() },
      { new: true }
    ).lean();
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteGoalNote = async (req, res) => {
  try {
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $pull: { notes: { _id: req.params.noteId } }, updatedAt: new Date() },
      { new: true }
    ).lean();
    if (!goal) return res.status(404).json({ message: "Meta no encontrada" });
    res.json({ success: true, goal });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
