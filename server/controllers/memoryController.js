const Memory = require("../models/Memory");

let groq = null;
try {
  const Groq = require("groq-sdk");
  if (process.env.GROQ_API_KEY?.length > 10) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch(_) {}

/* ── Extraer y guardar memorias de una conversación ── */
exports.extractAndSaveMemories = async (userId, userName, userMessage, assistantResponse) => {
  if (!groq) return;
  try {
    const existing = await Memory.find({ user: userId }).sort({ importance: -1 }).limit(40).lean();
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
- Máximo 2 memorias por turno, mínimo 0
- Tipos: personal, emotional, preference, relationship, goal, event, situation
- Importancia 1-5: 5=dato clave (trabajo, familia, situación crítica), 3=útil (gustos), 1=menor
- Si menciona un evento futuro con fecha (examen el viernes, presentación mañana, cita el lunes, reunión esta semana), añade "followUpDate" con la fecha ISO estimada basándote en que hoy es ${new Date().toISOString().slice(0,10)}
- Si no hay nada nuevo concreto, devuelve []
- Responde SOLO con JSON array, cero texto extra:
[{"content":"...","type":"...","importance":N,"tags":["..."],"followUpDate":"YYYY-MM-DD o null"}]`;

    const r = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const raw = r.choices[0]?.message?.content?.trim() || "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;

    let memories;
    try {
      memories = JSON.parse(match[0]);
    } catch (_) {
      // Attempt repair: strip control chars and smart quotes
      const repaired = match[0]
        .replace(/[\x00-\x1F\x7F]/g, " ")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"');
      try { memories = JSON.parse(repaired); } catch (_2) { return; }
    }
    if (!Array.isArray(memories) || !memories.length) return;

    for (const m of memories.slice(0, 2)) {
      if (!m.content || typeof m.content !== "string") continue;
      const dup = await Memory.exists({ user: userId, content: { $regex: m.content.substring(0, 30), $options: "i" } });
      if (!dup) {
        const followUpDate = m.followUpDate ? new Date(m.followUpDate) : null;
        await Memory.create({
          user: userId,
          content: m.content.substring(0, 600),
          type: ["personal","emotional","preference","relationship","goal","event","situation"].includes(m.type) ? m.type : "personal",
          importance: Math.min(5, Math.max(1, Number(m.importance) || 3)),
          tags: Array.isArray(m.tags) ? m.tags.slice(0, 5) : [],
          followUpDate: followUpDate && !isNaN(followUpDate) ? followUpDate : null,
        });
      }
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
      .lean();

    if (!memories.length) return "";

    await Memory.updateMany(
      { _id: { $in: memories.map(m => m._id) } },
      { $inc: { timesReferenced: 1 }, lastReferencedAt: new Date() }
    );

    return memories.map(m => `• [${m.type}] ${m.content}`).join("\n");
  } catch(e) { return ""; }
};

/* ── Obtener memorias relevantes AL MENSAJE ACTUAL (no solo las más importantes globalmente) ── */
exports.getContextualMemories = async (userId, message = "") => {
  try {
    const all = await Memory.find({ user: userId })
      .sort({ importance: -1 })
      .limit(50)
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
      keywords.forEach(kw => { if (content.includes(kw)) score += 15; });
      // Bonus por referenciada recientemente
      if (m.lastReferencedAt) {
        const daysSince = (Date.now() - new Date(m.lastReferencedAt)) / 86400000;
        if (daysSince < 7) score += 5;
      }
      return { ...m, _score: score };
    });

    const top = scored.sort((a, b) => b._score - a._score).slice(0, 12);

    await Memory.updateMany(
      { _id: { $in: top.map(m => m._id) } },
      { $inc: { timesReferenced: 1 }, lastReferencedAt: new Date() }
    ).catch(() => {});

    return top.map(m => `• [${m.type}] ${m.content}`).join("\n");
  } catch(e) { return ""; }
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
