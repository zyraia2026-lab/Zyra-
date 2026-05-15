const Journal = require("../models/Journal");

exports.getEntries = async (req, res) => {
  try {
    const entries = await Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, entries });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.createEntry = async (req, res) => {
  try {
    const { title, content, emotion, tags } = req.body;
    if (!content) return res.status(400).json({ message: "El contenido es requerido" });
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