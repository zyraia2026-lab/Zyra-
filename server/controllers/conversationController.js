const Conversation = require("../models/Conversation");

exports.getConversations = async (req, res) => {
  try {
    const list = await Conversation.find({ user: req.user._id }).sort({ updatedAt: -1 }).select("-messages").limit(30).lean();
    res.json({ success: true, conversations: list });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getConversation = async (req, res) => {
  try {
    const c = await Conversation.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!c) return res.status(404).json({ message: "No encontrada" });
    res.json({ success: true, conversation: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteConversation = async (req, res) => {
  try {
    await Conversation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.renameConversation = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) return res.status(400).json({ message: "Título requerido" });
    const c = await Conversation.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title: title.trim().slice(0, 100) },
      { new: true }
    ).select("title").lean();
    if (!c) return res.status(404).json({ message: "No encontrada" });
    res.json({ success: true, title: c.title });
  } catch (e) { res.status(500).json({ message: e.message }); }
};