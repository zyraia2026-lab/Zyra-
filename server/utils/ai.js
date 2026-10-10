/* Pedirle un texto a la IA desde cualquier parte del servidor sin quedarse colgado.
   Orden por defecto: Gemini (cupo gratis grande) → Groq 20b → Groq 120b. Sin reintentos:
   si un proveedor está sin cupo, falla en menos de un segundo y responde el siguiente.
   (El plan gratis de Groq da 8.000 tokens por minuto por modelo y la llamada de voz lo
   gasta; antes las funciones que solo usaban Groq fallaban o tardaban 20-40 s.) */

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_SAFETY = ["HARASSMENT", "HATE_SPEECH", "SEXUALLY_EXPLICIT", "DANGEROUS_CONTENT"]
  .map(category => ({ category: `HARM_CATEGORY_${category}`, threshold: "BLOCK_ONLY_HIGH" }));
const REASONING_MODELS = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);

let groq = null;
try {
  const Groq = require("groq-sdk");
  if (process.env.GROQ_API_KEY?.length > 10) groq = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0, timeout: 15000 });
} catch (_) {}

async function callGemini(messages, { temperature = 0.7, maxTokens = 400, timeoutMs = 15000, json = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.length < 10) throw new Error("Gemini no configurado");
  const system = messages.find(m => m.role === "system");
  const contents = messages
    .filter(m => m.role !== "system" && m.content)
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: String(system.content) }] } : undefined,
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
      safetySettings: GEMINI_SAFETY,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
  return (data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "").trim();
}

async function callGroq(model, messages, { temperature = 0.7, maxTokens = 400, timeoutMs = 15000 } = {}) {
  if (!groq) throw new Error("Groq no configurado");
  const r = await groq.chat.completions.create({
    model,
    messages: messages.map(m => ({ role: m.role, content: String(m.content) })),
    temperature,
    // Los gpt-oss gastan parte del presupuesto pensando antes de escribir
    max_tokens: REASONING_MODELS.has(model) ? maxTokens + 200 : maxTokens,
    ...(REASONING_MODELS.has(model) ? { reasoning_effort: "low" } : {}),
  }, { timeout: timeoutMs });
  return (r.choices?.[0]?.message?.content || "").trim();
}

/** messages: [{ role: "system"|"user"|"assistant", content }]. Devuelve el texto o lanza error. */
async function complete(messages, opts = {}) {
  const order = opts.order || ["gemini", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
  let lastErr = null;
  for (const p of order) {
    try {
      const text = p === "gemini" ? await callGemini(messages, opts) : await callGroq(p, messages, opts);
      if (text) return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("La IA no respondió");
}

/** Igual que complete() pero devuelve el JSON que venga en la respuesta (o null). */
async function completeJSON(messages, opts = {}) {
  const text = await complete(messages, { ...opts, json: true });
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) {}
  try {
    // Reparación básica: caracteres de control y comillas tipográficas
    return JSON.parse(m[0].replace(/[\x00-\x1F\x7F]/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
  } catch (_) { return null; }
}

// Hora de Colombia (UTC-5, sin horario de verano): el servidor corre en UTC
function colombiaNow(d = new Date()) {
  const c = new Date(d.getTime() - 5 * 3600 * 1000);
  return { hour: c.getUTCHours(), minute: c.getUTCMinutes(), day: c.getUTCDay(), date: c.toISOString().slice(0, 10) };
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { complete, completeJSON, colombiaNow, escapeRegex, _callGemini: callGemini, _callGroq: callGroq };
