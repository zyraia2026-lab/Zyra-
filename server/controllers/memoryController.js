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

    const prompt = `Eres un extractor de datos clave de conversaciones de bienestar emocional.
Dado este intercambio, extrae ÚNICAMENTE hechos nuevos y memorables sobre el usuario que valga la pena recordar a largo plazo.

Usuario "${userName}" dijo: "${userMessage}"
Zyra respondió: "${assistantResponse.substring(0, 200)}"

Memorias YA guardadas (NO repitas estas):
${existingList || "(ninguna aún)"}

REGLAS:
- Solo extrae si hay información personal relevante y duradera
- Máximo 2 memorias por turno, mínimo 0
- Tipos permitidos: personal, emotional, preference, relationship, goal, event
- Importancia 1-5: 5=muy relevante (nombre, trabajo, familia), 3=moderado (gustos), 1=efímero
- Si no hay nada nuevo que valga la pena recordar, devuelve []
- Responde SOLO con JSON array:
[{"content":"...","type":"...","importance":N,"tags":["..."]}]`;

    const r = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const raw = r.choices[0]?.message?.content?.trim() || "[]";
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return;

    const memories = JSON.parse(match[0]);
    if (!Array.isArray(memories) || !memories.length) return;

    for (const m of memories.slice(0, 2)) {
      if (!m.content || typeof m.content !== "string") continue;
      const dup = await Memory.findOne({ user: userId, content: { $regex: m.content.substring(0, 30), $options: "i" } });
      if (!dup) {
        await Memory.create({
          user: userId,
          content: m.content.substring(0, 600),
          type: ["personal","emotional","preference","relationship","goal","event"].includes(m.type) ? m.type : "personal",
          importance: Math.min(5, Math.max(1, Number(m.importance) || 3)),
          tags: Array.isArray(m.tags) ? m.tags.slice(0, 5) : [],
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

    return memories
      .map(m => `• [${m.type}] ${m.content}`)
      .join("\n");
  } catch(e) {
    return "";
  }
};

/* ── API: listar memorias ── */
exports.getMemories = async (req, res) => {
  try {
    const memories = await Memory.find({ user: req.user._id })
      .sort({ importance: -1, createdAt: -1 });
    res.json({ success: true, memories });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ── API: borrar una memoria ── */
exports.deleteMemory = async (req, res) => {
  try {
    const m = await Memory.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!m) return res.status(404).json({ message: "Memoria no encontrada" });
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
