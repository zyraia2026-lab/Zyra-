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

exports.deleteGoal = async (req, res) => {
  try {
    await Goal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
