const WARNING_PATTERNS = [
  /me quiero morir(?!\s*(de\s*(la\s*)?(risa|verguenza|pena|envidia|celos)|jaja|jsjs|xd))/i,
  /quisiera no existir/i, /ya no quiero vivir/i,
  /no tiene sentido seguir/i, /todo sería mejor sin mí/i, /todo seria mejor sin mi/i,
  /hacerme daño/i, /lastimarme/i, /me odio/i, /nadie me quiere/i,
  /soy un fracaso/i, /no puedo más/i, /no puedo mas/i, /estoy desesperado/i,
  /estoy desesperada/i, /ya no aguanto/i, /no veo salida/i,
  // Variantes adicionales — formas reales, indirectas o coloquiales de pedir ayuda
  /quiero desaparecer/i, /no quiero existir/i, /no quiero estar aqui/i,
  /siento que soy una carga/i, /ya no le importo a nadie/i, /a nadie le importaria/i,
  /todo estaria mejor sin mi/i, /no aguanto esta vida/i, /estoy al limite/i,
  /no le encuentro sentido a nada/i, /no quiero despertar/i, /ojala no despertara/i,
  /no quiero seguir asi/i, /ya no doy mas/i, /estoy vacio por dentro/i,
  /estoy vacia por dentro/i, /me siento atrapado/i, /me siento atrapada/i,
  /no valgo nada/i, /nada tiene sentido/i, /quiero que esto se acabe/i,
  /quiero que todo acabe/i, /estoy pensando en hacerme dano/i,
  /no le veo futuro a esto/i, /quisiera dormir y no despertar/i,
  /ya no tengo ganas de nada/i, /me quiero ir de este mundo/i,
  /estoy roto por dentro/i, /estoy rota por dentro/i, /no aguanto mas esto/i,
  /ya no puedo con esto/i, /siento que no pertenezco a este mundo/i,
];

const CRISIS_PATTERNS = [
  /me voy a suicidar/i, /voy a suicidarme/i, /me voy a matar/i, /quiero matarme/i,
  /voy a quitarme la vida/i, /me voy a hacer daño/i, /me voy a cortar/i,
  /me voy a tomar (?:las |unas )?pastillas/i, /me voy a tirar/i, /me voy a lanzar/i,
  /tengo una soga/i, /tengo un arma/i, /me voy a disparar/i,
  /voy a matar (?:a )?(?:alguien|una persona|mi|el|la|los|las)/i,
  /quiero matar (?:a )?(?:alguien|una persona|mi|el|la|los|las)/i,
  /voy a atacar/i, /voy a lastimar (?:a )?(?:alguien|otra persona)/i,
  /tengo ganas de matar/i, /voy a disparar/i, /voy a apuñalar/i,
  // Variantes adicionales de intención explícita — mismo nivel de severidad
  // "quiero morirme" es tambien un modismo comun ("me muero de la risa/verguenza/pena")
  // que no indica riesgo real — se excluye esa continuacion para evitar falsos positivos.
  /quiero morirme(?!\s*(de\s*(la\s*)?(risa|verguenza|pena|envidia|celos)|jaja|jsjs|xd))/i,
  /me quiero suicidar/i, /voy a acabar con (?:mi vida|todo)/i,
  /voy a terminar con (?:mi vida|todo)/i, /planeo quitarme la vida/i,
  /ya tengo todo listo para (?:morir|matarme|suicidarme)/i,
  /no quiero seguir viviendo/i, /quiero terminar con mi vida/i,
  /me voy a ahorcar/i, /me voy a envenenar/i, /voy a saltar (?:del|desde)/i,
  /quiero quitarme la vida/i, /ya no quiero seguir aqui/i,
  /tengo (?:las )?pastillas listas/i, /ya escribi (?:la )?carta de despedida/i,
  /tengo el metodo listo/i, /ya decidi como hacerlo/i,
  /esta va a ser mi despedida/i, /esto es un adios/i,
];

function classifyMessage(text) {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const re of CRISIS_PATTERNS) { if (re.test(t)) return "crisis"; }
  for (const re of WARNING_PATTERNS) { if (re.test(t)) return "warning"; }
  return "safe";
}

async function notifyEmergencyContact(userId, userName, message) {
  try {
    const User    = require("../models/User");
    const Profile = require("../models/Profile");
    const { sendCrisisAlert } = require("../utils/emailService");

    const [user, profile] = await Promise.all([
      User.findById(userId).select("email").lean(),
      Profile.findOne({ user: userId }).select("emergencyContact").lean(),
    ]);

    const contact = profile?.emergencyContact;

    // Notificar al contacto de emergencia si tiene email propio.
    // El envío puede fallar (ej. proveedor de correo caído o IP no autorizada) —
    // esto es una alerta de seguridad, así que un fallo silencioso es peor que
    // ruido en el log: si falla, debe quedar visible para poder actuar.
    if (contact?.name && contact?.email) {
      await sendCrisisAlert(contact.email, contact.name, userName, message)
        .catch(e => console.error(`🚨 [CRISIS] Fallo enviando alerta al contacto de emergencia de ${userId}:`, e.message));
    }

    // Siempre notificar al propio usuario
    if (user?.email) {
      await sendCrisisAlert(user.email, userName, userName, message)
        .catch(e => console.error(`🚨 [CRISIS] Fallo enviando alerta al propio usuario ${userId}:`, e.message));
    }

    console.log(`🚨 [CRISIS] Proceso de alerta completado para usuario ${userId} (${userName})`);
  } catch(e) { console.error(`🚨 [CRISIS] Error inesperado notificando crisis para ${userId}:`, e.message); }
}

// Vocabulario emocional amplio (no crisis explícita) — filtro barato para decidir
// si vale la pena gastar una llamada de IA como segunda opinión. La mayoría de
// mensajes (casuales, factuales) nunca llegan a esta capa.
const EMOTIONAL_TONE_RE = /\b(triste|ansios|deprimid|angustia|desesperad|solo|sola|vac[ií]o|vac[ií]a|cansad|agotad|dolor|llorar|llorando|miedo|p[aá]nico|abrumad|frustrad|perdid|harta|harto|rota|roto|carga|fracas)\w*\b/i;

// Segunda opinión por IA — SOLO puede subir el nivel a "warning" (tono más
// cuidadoso en la respuesta). Nunca dispara el aviso al contacto de emergencia:
// eso queda reservado a coincidencias exactas del regex, para no arriesgarnos a
// notificar a alguien por una alucinación o falso positivo del modelo.
async function aiSecondOpinion(message) {
  try {
    const Groq = require("groq-sdk");
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.length < 10) return false;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const r = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [{
        role: "user",
        content: `¿Este mensaje muestra angustia emocional real que merece una respuesta especialmente cuidadosa (no necesariamente riesgo de vida, solo dolor genuino)? Responde SOLO "si" o "no", nada más.\n\nMensaje: "${message.substring(0, 300)}"`,
      }],
      temperature: 0,
      max_tokens: 150,
      reasoning_effort: "low",
    });
    const answer = (r.choices[0]?.message?.content || "").trim().toLowerCase();
    return answer.startsWith("si") || answer.startsWith("sí");
  } catch (e) {
    return false; // falla silenciosa — el regex ya corrió, esto es solo un plus
  }
}

async function safetyGuard(req, res, next) {
  const { message } = req.body;
  if (!message?.trim()) return next();

  const level = classifyMessage(message);

  if (level === "crisis") {
    console.warn(`🚨 [CRISIS] usuario: ${req.user?._id} — "${message.substring(0, 80)}"`);

    try {
      const Profile = require("../models/Profile");
      Profile.findOneAndUpdate(
        { user: req.user._id },
        { $push: { crisisEvents: { message: message.substring(0, 500), timestamp: new Date() } } }
      ).catch(() => {});
    } catch (_) {}

    notifyEmergencyContact(req.user._id, req.user.name, message).catch(() => {});

    return res.json({
      success:        true,
      crisis:         true,
      crisisLevel:    "high",
      response:       "",
      cards:          [],
      conversationId: req.body.conversationId || null,
    });
  }

  if (level === "warning") {
    console.warn(`⚠️  [WARNING] usuario: ${req.user?._id}`);
    req.safetyWarning = true;
    req.safetyLevel   = "warning";
    return next();
  }

  // "safe" según el regex — como red de apoyo, si el mensaje trae carga emocional
  // real pero está frased distinto a los patrones conocidos, se le da una segunda
  // mirada rápida antes de seguir. No bloquea mucho (~modelo chico) y nunca sube
  // a nivel crisis por sí sola.
  if (EMOTIONAL_TONE_RE.test(message) && message.trim().length > 12) {
    const flagged = await Promise.race([
      aiSecondOpinion(message),
      new Promise(resolve => setTimeout(() => resolve(false), 2500)), // no retrasar el chat más de 2.5s
    ]);
    if (flagged) {
      console.warn(`⚠️  [WARNING-IA] usuario: ${req.user?._id} — regex dio "safe" pero la IA detectó angustia real`);
      req.safetyWarning = true;
      req.safetyLevel   = "warning";
    }
  }

  next();
}

module.exports = { safetyGuard, classifyMessage };
