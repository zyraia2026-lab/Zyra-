const mongoose = require("mongoose");

const S = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:    { type: String, required: true, maxlength: 600 },
  type:       { type: String, enum: ["personal","emotional","preference","relationship","goal","event","situation"], default: "personal" },
  importance: { type: Number, min: 1, max: 5, default: 3 },
  tags:       [String],
  timesReferenced:  { type: Number, default: 0 },
  createdAt:        { type: Date, default: Date.now },
  lastReferencedAt: { type: Date, default: null },
  followUpDate:     { type: Date, default: null }, // fecha para hacer seguimiento (ej: "examen el jueves")
  followUpDone:     { type: Boolean, default: false },
  // "Zyra se acuerda": las frases salen al guardar la memoria (una sola llamada a la IA)
  followUpCheer:     { type: String, default: "", maxlength: 200 }, // la víspera: "Mañana es tu examen de cálculo. ¡Tú puedes!"
  followUpQuestion:  { type: String, default: "", maxlength: 200 }, // después: "¿Cómo te fue en el examen de cálculo?"
  followUpCheeredAt: { type: Date, default: null },
  followUpAskedAt:   { type: Date, default: null },
});

S.index({ user: 1, importance: -1 });
S.index({ user: 1, followUpDate: 1, followUpDone: 1 }, { sparse: true });
module.exports = mongoose.model("Memory", S);
