const mongoose = require("mongoose");

// Solicitudes del formulario B2B ("Solicitar demo"). Se guardan para que no se
// pierdan si el aviso por correo falla, y para contarlas en el panel admin.
const S = new mongoose.Schema({
  name:      { type: String, required: true, maxlength: 100 },
  company:   { type: String, default: "", maxlength: 150 },
  email:     { type: String, required: true, maxlength: 254 },
  size:      { type: String, default: "", maxlength: 10 },
  message:   { type: String, default: "", maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("ContactLead", S);
