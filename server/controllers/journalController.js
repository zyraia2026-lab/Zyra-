const Journal = require("../models/Journal");
const { getPlan } = require("../middleware/planGate");

exports.getEntries = async (req, res) => {
  try {
    const { limits } = getPlan(req.user);
    const cap = limits.journal === Infinity ? 100 : limits.journal;
    const entries = await Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(cap);
    res.json({ success: true, entries });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createEntry = async (req, res) => {
  try {
    const { title, content, emotion, tags } = req.body;
    if (!content) return res.status(400).json({ message: "El contenido es requerido" });

    const { limits } = getPlan(req.user);
    if (limits.journal !== Infinity) {
      // Count entries this month
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const countThisMonth = await Journal.countDocuments({ user: req.user._id, createdAt: { $gte: startOfMonth } });
      if (countThisMonth >= limits.journal) {
        return res.status(403).json({
          limitReached: true,
          plan: req.user.plan || "free",
          limit: limits.journal,
          message: `Has alcanzado el límite de ${limits.journal} entradas de diario este mes para tu plan. Actualiza tu plan para escribir más.`,
        });
      }
    }

    const entry = await Journal.create({ user: req.user._id, title, content, emotion, tags });
    res.status(201).json({ success: true, entry });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteEntry = async (req, res) => {
  try {
    await Journal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
