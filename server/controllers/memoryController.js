const Memory = require("../models/Memory");

/* ── Antigüedad legible de una memoria, para que la IA sepa si un dato ya pasó ── */
function ageLabel(createdAt) {
  const days = Math.floor((Date.now() - new Date(createdAt)) / 86400000);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 30) { const w = Math.floor(days / 7); return `hace ${w} semana${w > 1 ? "s" : ""}`; }
  if (days < 365) { const m = Math.floor(days / 30); return `hace ${m} mes${m > 1 ? "es" : ""}`; }
  const y = Math.floor(days / 365); return `hace ${y} año${y > 1 ? "s" : ""}`;
}
function formatMemory(m) {
  return `• [${m.type}, ${ageLabel(m.createdAt)}] ${m.content}`;
}

const ai = require("../utils/ai");

/* ── Extraer y guardar memorias de una conversación ── */
exports.extractAndSaveMemories = async (userId, userName, userMessage, assistantResponse) => {
  try {
    const existing = await Memory.find({ user: userId }).sort({ importance: -1 }).limit(40).select("content").lean();
    const existingList = existing.map(m => m.content).join("\n");

    const prompt = `Eres un extractor de contexto personal para Zyra, una IA amiga. Analiza esta conversación y extrae SOLO hechos nuevos sobre ${userName} que valga la pena recordar en futuras sesiones.

Usuario dijo: "${userMessage}"
Zyra respondió: "${assistantResponse.substring(0, 200)}"

Memorias YA guardadas (NO repetir):
${existingList || "(ninguna aún)"}

Qué SÍ extraer (ejemplos):
- Nombre real, apodo, ciudad, trabajo, carrera, familia
- Relaciones importantes (pareja, amigos, hijos, padres)
- Situaciones específicas que está viviendo (ruptura, trabajo nuevo, duelo, examen)
- Miedos, inseguridades o patrones emocionales recurrentes
- Gustos, hobbies, cosas que le gustan o no le gustan
- Metas personales concretas que mencionó

Qué NO extraer:
- Estados emocionales pasajeros de hoy
- Temas genéricos sin contexto personal
- Cosas ya guardadas en memorias existentes

REGLAS DE FORMATO:
- Máximo 4 memorias por turno, mínimo 0 (si el mensaje trae varios datos nuevos distintos, ej. nombre + ciudad + trabajo + mascota, extráelos TODOS por separado — no elijas solo algunos)
- "content" siempre en frase corta y natural, nunca una palabra suelta (ej: "Vive en Medellín", no "Medellín"; "Trabaja como ingeniero", no "Ingeniero")
- Tipos: personal, emotional, preference, relationship, goal, event, situation
- Importancia 1-5: 5=dato clave (trabajo, familia, situación crítica), 3=útil (gustos), 1=menor
- Si menciona un evento futuro con fecha (examen el viernes, presentación mañana, cita el lunes, reunión esta semana), añade "followUpDate" con la fecha ISO estimada basándote en que hoy es ${ai.colombiaNow().date} (hora Colombia), y además:
  · "followUpCheer": frase corta de ánimo para la víspera, hablándole de tú (ej: "Mañana es tu examen de cálculo. ¡Tú puedes! 💪")
  · "followUpQuestion": pregunta corta y natural para después del evento (ej: "¿Cómo te fue en el examen de cálculo?")
  Las dos sin marcas de género (nada de "listo/lista", "nervioso/a") y sin comillas.
- Si no hay nada nuevo concreto, devuelve []
- Responde SOLO con JSON array, cero texto extra:
[{"content":"...","type":"...","importance":N,"tags":["..."],"followUpDate":"YYYY-MM-DD o null","followUpCheer":"... o null","followUpQuestion":"... o null"}]`;

    // Gemini primero y Groq de respaldo, sin esperas: antes solo Groq, y cuando la llamada
    // de voz le gastaba el cupo por minuto la memoria se perdía
    const memories = await ai.completeJSON([{ role: "user", content: prompt }], { temperature: 0.1, maxTokens: 700 });
    if (!Array.isArray(memories) || !memories.length) return;

    const today = new Date(ai.colombiaNow().date + "T00:00:00Z");
    for (const m of memories.slice(0, 4)) {
      if (!m || !m.content || typeof m.content !== "string") continue;
      // Antes el texto iba tal cual como patrón de búsqueda: con un "(" o un "?" la búsqueda
      // fallaba y la memoria no se guardaba
      const dup = await Memory.exists({ user: userId, content: { $regex: ai.escapeRegex(m.content.substring(0, 30)), $options: "i" } });
      if (dup) continue;
      let followUpDate = m.followUpDate ? new Date(m.followUpDate) : null;
      // Solo fechas de hoy a 3 meses: la IA a veces devuelve fechas pasadas o inventadas
      if (followUpDate && (isNaN(followUpDate) || followUpDate < today || followUpDate - today > 92 * 86400000)) followUpDate = null;
      const phrase = (s) => (typeof s === "string" && s.trim() && s.trim().toLowerCase() !== "null") ? s.trim().replace(/^["'«“]+|["'»”]+$/g, "").slice(0, 200) : "";
      await Memory.create({
        user: userId,
        content: m.content.substring(0, 600),
        type: ["personal","emotional","preference","relationship","goal","event","situation"].includes(m.type) ? m.type : "personal",
        importance: Math.min(5, Math.max(1, Number(m.importance) || 3)),
        tags: Array.isArray(m.tags) ? m.tags.filter(t => typeof t === "string").slice(0, 5) : [],
        followUpDate,
        followUpCheer: followUpDate ? phrase(m.followUpCheer) : "",
        followUpQuestion: followUpDate ? phrase(m.followUpQuestion) : "",
      });
    }
  } catch(e) {
    console.error("extractAndSaveMemories:", e.message);
  }
};

/* ── Obtener memorias relevantes para inyectar en el prompt ── */
exports.getMemoriesForPrompt = async (userId) => {
  try {
    const memories = await Memory.find({ user: userId })
      .sort({ importance: -1, lastReferencedAt: -1 })
      .limit(15)
      .select("type content importance createdAt _id")
      .lean();

    if (!memories.length) return "";

    await Memory.updateMany(
      { _id: { $in: memories.map(m => m._id) } },
      { $inc: { timesReferenced: 1 }, lastReferencedAt: new Date() }
    );

    return memories.map(formatMemory).join("\n");
  } catch(e) { return ""; }
};

/* ── Obtener memorias relevantes AL MENSAJE ACTUAL (no solo las más importantes globalmente) ── */
exports.getContextualMemories = async (userId, message = "") => {
  try {
    const all = await Memory.find({ user: userId })
      .sort({ importance: -1 })
      .limit(50)
      .select("type content importance lastReferencedAt createdAt _id")
      .lean();

    if (!all.length) return "";

    // Extrae palabras clave del mensaje actual (filtra stopwords)
    const STOP = new Set(["estoy","tengo","quiero","puedo","sobre","como","para","cuando","donde","quien","cuanto","seria","tenia","habia","hacia","algo","nada","todo","esto","eso","eso","aqui","alla","bien","mal","muy","mas","pero","que","con","sin","por","las","los","una","uno","hay","fue","era","son","han","ser"]);
    const keywords = message.toLowerCase()
      .replace(/[^a-záéíóúüñ\s]/gi, "")
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w));

    // Puntúa cada memoria: base = importancia, bonus = coincidencias de keywords
    const scored = all.map(m => {
      const content = m.content.toLowerCase();
      let score = m.importance * 10;
      let keywordHit = false;
      keywords.forEach(kw => { if (content.includes(kw)) { score += 15; keywordHit = true; } });
      // Bonus por referenciada recientemente
      if (m.lastReferencedAt) {
        const daysSince = (Date.now() - new Date(m.lastReferencedAt)) / 86400000;
        if (daysSince < 7) score += 5;
      }
      // Los recuerdos puntuales (un partido, una cita, un examen) caducan solos si nadie
      // vuelve a sacar el tema — si no, se quedan compitiendo por importancia para siempre
      // y la IA los saca a colación como si fueran de ahora (ej: preguntar por un partido de hace meses).
      if (!keywordHit) {
        const ageDays = (Date.now() - new Date(m.createdAt)) / 86400000;
        if (m.type === "event" && ageDays > 14) score *= 0.15;
        else if (m.type === "situation" && ageDays > 45) score *= 0.4;
      }
      return { ...m, _score: score };
    });

    const top = scored.sort((a, b) => b._score - a._score).slice(0, 12);

    await Memory.updateMany(
      { _id: { $in: top.map(m => m._id) } },
      { $inc: { timesReferenced: 1 }, lastReferencedAt: new Date() }
    ).catch(() => {});

    return top.map(formatMemory).join("\n");
  } catch(e) { return ""; }
};

/* ── "Zyra se acuerda de ti" ──
   Elige el seguimiento que toca ahora para una persona:
   - "ask": un evento que ya pasó (de 4 días atrás a hoy desde las 5 pm) → "¿Cómo te fue en…?"
   - "cheer": un evento de mañana (o de hoy antes de las 5 pm) → "Mañana es tu examen… ¡Tú puedes!"
   Las frases se guardan al crear la memoria; las memorias viejas que no las tienen se completan
   una sola vez con la IA (y queda guardado). */
const DAY_MS = 86400000;
function _followUpFallback(kind, content) {
  const c = String(content || "").replace(/\.$/, "");
  return kind === "ask" ? `Oye, ¿cómo te fue con esto que me contaste: «${c}»?` : `Me acordé de algo que me contaste: «${c}». ¡Te mando toda la buena energía! 💜`;
}
async function _fillPhrase(mem, kind) {
  const field = kind === "ask" ? "followUpQuestion" : "followUpCheer";
  if (mem[field]) return mem[field];
  let text = "";
  try {
    const instr = kind === "ask"
      ? `Convierte este dato en UNA pregunta corta y natural que una amiga haría después del evento, hablándole de tú y sin marcas de género. Dato: "${mem.content}". Ejemplo: "Tiene examen de cálculo el viernes" → "¿Cómo te fue en el examen de cálculo?". Solo la pregunta, sin comillas.`
      : `Convierte este dato en UNA frase corta de ánimo para la víspera del evento, hablándole de tú y sin marcas de género. Dato: "${mem.content}". Ejemplo: "Tiene examen de cálculo el viernes" → "Mañana es tu examen de cálculo. ¡Tú puedes! 💪". Solo la frase, sin comillas.`;
    text = (await ai.complete([{ role: "user", content: instr }], { temperature: 0.4, maxTokens: 80, timeoutMs: 8000 }))
      .split("\n")[0].trim().replace(/^["'«“]+|["'»”]+$/g, "").slice(0, 200);
  } catch (_) {}
  if (!text) return _followUpFallback(kind, mem.content);
  await Memory.updateOne({ _id: mem._id }, { [field]: text }).catch(() => {});
  return text;
}
// Regla pura (sin base de datos) para poder probarla: mems ordenadas de la más reciente a la más vieja
function chooseFollowUp(mems, now = new Date()) {
  const col = ai.colombiaNow(now);
  const today = new Date(col.date + "T00:00:00Z"); // día de Colombia
  const evening = col.hour >= 17;
  const day = (m) => +new Date(m.followUpDate);
  const inWindow = mems.filter(m => m.followUpDate && day(m) >= +today - 4 * DAY_MS && day(m) <= +today + 2 * DAY_MS);
  // 1) Después del evento: lo más reciente primero
  const asked = inWindow.find(m => !m.followUpAskedAt && (day(m) < +today || (day(m) === +today && evening)));
  if (asked) return { kind: "ask", mem: asked };
  // 2) La víspera (o el mismo día, antes de que pase)
  const tomorrow = +today + DAY_MS;
  const cheer = inWindow.find(m => !m.followUpCheeredAt && !m.followUpAskedAt && (day(m) === tomorrow || (day(m) === +today && !evening)));
  if (cheer) return { kind: "cheer", mem: cheer };
  return null;
}
async function pickFollowUp(userId, now = new Date()) {
  const today = new Date(ai.colombiaNow(now).date + "T00:00:00Z");
  const mems = await Memory.find({
    user: userId,
    followUpDate: { $gte: new Date(today - 4 * DAY_MS), $lte: new Date(+today + 2 * DAY_MS) },
  }).sort({ followUpDate: -1 }).lean();
  return chooseFollowUp(mems, now);
}
exports._chooseFollowUp = chooseFollowUp;
async function markFollowUp(pick) {
  const set = pick.kind === "ask" ? { followUpAskedAt: new Date(), followUpDone: true } : { followUpCheeredAt: new Date() };
  await Memory.updateOne({ _id: pick.mem._id }, set);
}
exports.pickFollowUp = pickFollowUp;
exports.markFollowUp = markFollowUp;
exports.followUpText = (pick) => _fillPhrase(pick.mem, pick.kind);

/* GET /api/memory/followup → { followUp: { kind, text, id } | null }
   ?peek=1 solo mira (tarjeta del Inicio); sin peek lo marca (Zyra lo dijo en el chat). */
exports.getFollowUp = async (req, res) => {
  try {
    // ?recent=1: lo último que Zyra preguntó o deseó por notificación (últimas 36 h), para que
    // al tocar el aviso el chat abra con esa misma pregunta y la persona pueda responder
    if (req.query.recent) {
      const since = new Date(Date.now() - 36 * 3600 * 1000);
      const m = await Memory.findOne({ user: req.user._id, $or: [{ followUpAskedAt: { $gte: since } }, { followUpCheeredAt: { $gte: since } }] })
        .sort({ followUpAskedAt: -1, followUpCheeredAt: -1 }).lean();
      if (!m) return res.json({ followUp: null });
      const kind = m.followUpAskedAt && m.followUpAskedAt >= since ? "ask" : "cheer";
      return res.json({ followUp: { kind, text: await _fillPhrase(m, kind), id: m._id, date: m.followUpDate } });
    }
    const pick = await pickFollowUp(req.user._id);
    if (!pick) return res.json({ followUp: null });
    const text = await _fillPhrase(pick.mem, pick.kind);
    if (!req.query.peek) await markFollowUp(pick);
    res.json({ followUp: { kind: pick.kind, text, id: pick.mem._id, date: pick.mem.followUpDate } });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

/* ── API: listar memorias ── */
exports.getMemories = async (req, res) => {
  try {
    const memories = await Memory.find({ user: req.user._id })
      .sort({ importance: -1, createdAt: -1 }).lean();
    res.json({ success: true, memories });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ── API: borrar una memoria ── */
exports.deleteMemory = async (req, res) => {
  try {
    const { deletedCount } = await Memory.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!deletedCount) return res.status(404).json({ message: "Memoria no encontrada" });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ── API: borrar todas las memorias ── */
exports.clearMemories = async (req, res) => {
  try {
    await Memory.deleteMany({ user: req.user._id });
    res.json({ success: true, message: "Memorias borradas" });
  } catch(e) { res.status(500).json({ message: e.message }); }
};
