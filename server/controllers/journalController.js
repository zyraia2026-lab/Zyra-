const Journal = require("../models/Journal");
const { getPlan } = require("../middleware/planGate");

exports.getEntries = async (req, res) => {
  try {
    const { limits } = getPlan(req.user);
    const cap = limits.journal === Infinity ? 100 : limits.journal;
    const entries = await Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(cap).lean();
    res.json({ success: true, entries });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createEntry = async (req, res) => {
  try {
    const { emotion, tags } = req.body;
    const title   = String(req.body.title || "").trim().substring(0, 200);
    const content = String(req.body.content || "").trim();
    if (!content) return res.status(400).json({ message: "El contenido es requerido" });
    if (content.length > 20000) return res.status(400).json({ message: "Entrada demasiado larga (máx. 20.000 caracteres)" });

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

    const entry = await Journal.create({ user: req.user._id, title, content: content.substring(0,20000), emotion, tags });

    // Verificar logro journal_10 en background (atómico: condición evita doble conteo)
    Journal.countDocuments({ user: req.user._id }).then(async (total) => {
      if (total >= 10) {
        const Profile = require("../models/Profile");
        await Profile.findOneAndUpdate(
          { user: req.user._id, achievements: { $ne: "journal_10" } },
          { $addToSet: { achievements: "journal_10" }, $inc: { coins: 20 } }
        );
      }
    }).catch(() => {});

    res.status(201).json({ success: true, entry });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateEntry = async (req, res) => {
  try {
    const { emotion, tags } = req.body;
    const title   = String(req.body.title || "").trim().substring(0, 200);
    const content = String(req.body.content || "").trim();
    if (!content) return res.status(400).json({ message: "El contenido es requerido" });
    if (content.length > 20000) return res.status(400).json({ message: "Entrada demasiado larga" });
    const entry = await Journal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title, content: content.substring(0,20000), emotion, tags, updatedAt: new Date() },
      { new: true }
    );
    if (!entry) return res.status(404).json({ message: "Entrada no encontrada" });
    res.json({ success: true, entry });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteEntry = async (req, res) => {
  try {
    await Journal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
