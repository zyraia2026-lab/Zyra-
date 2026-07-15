const r    = require("express").Router();
const Note = require("../models/FutureNote");
const { protect } = require("../middleware/auth");

/* POST /api/future-notes — crear nota */
r.post("/", protect, async (req, res) => {
  try {
    const message   = String(req.body.message || "").trim();
    const deliverAt = new Date(req.body.deliverAt);
    if (!message) return res.status(400).json({ message: "El mensaje no puede estar vacío" });
    if (message.length > 1000) return res.status(400).json({ message: "Máximo 1000 caracteres" });
    if (!deliverAt || isNaN(deliverAt.getTime())) return res.status(400).json({ message: "Fecha inválida" });
    if (deliverAt <= new Date()) return res.status(400).json({ message: "La fecha debe ser futura" });
    const maxDate = new Date(); maxDate.setFullYear(maxDate.getFullYear() + 5);
    if (deliverAt > maxDate) return res.status(400).json({ message: "Máximo 5 años en el futuro" });

    // Max 10 pending notes per user
    const pending = await Note.countDocuments({ user: req.user._id, delivered: false });
    if (pending >= 10) return res.status(429).json({ message: "Máximo 10 notas pendientes" });

    const note = await Note.create({ user: req.user._id, message, deliverAt });
    res.status(201).json({ success: true, note });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/future-notes — listar mis notas (pendientes + entregadas) */
r.get("/", protect, async (req, res) => {
  try {
    const notes = await Note.find({ user: req.user._id })
      .sort({ deliverAt: 1 }).limit(20).lean();
    res.json({ success: true, notes });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* DELETE /api/future-notes/:id — borrar nota pendiente */
r.delete("/:id", protect, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!note) return res.status(404).json({ message: "Nota no encontrada" });
    if (note.delivered) return res.status(400).json({ message: "No puedes borrar una nota ya entregada" });
    await Note.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = r;
