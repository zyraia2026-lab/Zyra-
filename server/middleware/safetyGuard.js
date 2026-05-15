/**
 * ZYRA — SAFETY GUARD MIDDLEWARE
 * Detecta mensajes de crisis y bloquea la IA.
 */

// Nivel 1 — advertencia (contexto preocupante)
const WARNING_PATTERNS = [
  /me quiero morir/i,
  /quisiera no existir/i,
  /ya no quiero vivir/i,
  /no tiene sentido seguir/i,
  /todo sería mejor sin mí/i,
  /hacerme daño/i,
  /lastimarme/i,
  /me odio/i,
  /nadie me quiere/i,
  /soy un fracaso/i,
];

// Nivel 2 — crisis real (bloqueo inmediato)
const CRISIS_PATTERNS = [
  /me voy a suicidar/i,
  /voy a suicidarme/i,
  /me voy a matar/i,
  /quiero matarme/i,
  /voy a quitarme la vida/i,
  /me voy a hacer daño/i,
  /me voy a cortar/i,
  /me voy a tomar (?:las |unas )?pastillas/i,
  /me voy a tirar/i,
  /me voy a lanzar/i,
  /tengo una soga/i,
  /tengo un arma/i,
  /me voy a disparar/i,
  /voy a matar (?:a )?(?:alguien|una persona|mi|el|la|los|las)/i,
  /quiero matar (?:a )?(?:alguien|una persona|mi|el|la|los|las)/i,
  /voy a atacar/i,
  /voy a lastimar (?:a )?(?:alguien|otra persona)/i,
  /tengo ganas de matar/i,
  /voy a disparar/i,
  /voy a apuñalar/i,
];

function classifyMessage(text) {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const re of CRISIS_PATTERNS) {
    if (re.test(t)) return "crisis";
  }
  for (const re of WARNING_PATTERNS) {
    if (re.test(t)) return "warning";
  }
  return "safe";
}

function safetyGuard(req, res, next) {
  const { message } = req.body;
  if (!message?.trim()) return next();

  const level = classifyMessage(message);

  if (level === "crisis") {
    console.warn(`🚨 [CRISIS] usuario: ${req.user?._id} — "${message.substring(0, 80)}"`);

    // Guardar el evento en el perfil del usuario
    try {
      const Profile = require("../models/Profile");
      Profile.findOneAndUpdate(
        { user: req.user._id },
        { $push: { crisisEvents: { message: message.substring(0, 500), timestamp: new Date() } } }
      ).catch(() => {});
    } catch (_) {}

    return res.json({
      success: true,
      crisis: true,
      response: "",
      cards: [],
      conversationId: req.body.conversationId || null,
    });
  }

  if (level === "warning") {
    console.warn(`⚠️  [WARNING] usuario: ${req.user?._id}`);
    req.safetyWarning = true;
  }

  next();
}

module.exports = { safetyGuard, classifyMessage };