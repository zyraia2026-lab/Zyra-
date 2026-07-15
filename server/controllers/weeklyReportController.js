const WeeklyReport = require("../models/WeeklyReport");
const Profile      = require("../models/Profile");
const Goal         = require("../models/Goal");
const Journal      = require("../models/Journal");
const Conversation = require("../models/Conversation");
const { sendWeeklyReport } = require("../utils/emailService");

let groq = null;
try {
  const Groq = require("groq-sdk");
  if (process.env.GROQ_API_KEY?.length > 10) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch(_) {}

const POSITIVE = new Set(["feliz","tranquilo","esperanzado","motivado"]);
const NEGATIVE  = new Set(["ansioso","triste","enojado","agotado","confundido"]);
function emotionScore(e) {
  if (POSITIVE.has(e)) return 1;
  if (NEGATIVE.has(e))  return -1;
  return 0;
}

function getMondayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

async function buildReportData(userId, userName) {
  const weekStart = getMondayOf();
  weekStart.setDate(weekStart.getDate() - 7); // la semana pasada
  const weekEnd   = getMondayOf();

  const [profile, goals, journals, sessionCount] = await Promise.all([
    Profile.findOne({ user: userId }).lean(),
    Goal.find({ user: userId }).lean(),
    Journal.find({ user: userId, createdAt: { $gte: weekStart, $lt: weekEnd } }).lean(),
    Conversation.countDocuments({ user: userId, updatedAt: { $gte: weekStart, $lt: weekEnd } }),
  ]);

  const history = (profile?.emotionHistory || []).filter(h => {
    const t = new Date(h.date).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  });

  const freq = {};
  history.forEach(h => { freq[h.emotion] = (freq[h.emotion] || 0) + 1; });
  const topEmotion = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0] || "tranquilo";
  const positivity = history.length > 0
    ? Math.round(history.filter(h => POSITIVE.has(h.emotion)).length / history.length * 100)
    : 0;
  const avgScore = history.length > 0
    ? (history.reduce((s,h) => s + emotionScore(h.emotion), 0) / history.length).toFixed(2)
    : 0;

  const completedThisWeek = goals.filter(g => {
    return g.completed && new Date(g.updatedAt).getTime() >= weekStart.getTime();
  });

  return {
    userName, weekStart, weekEnd, history, topEmotion, positivity,
    avgScore: Number(avgScore), journals, sessionCount,
    completedGoals: completedThisWeek,
    activeGoals: goals.filter(g => !g.completed).slice(0, 5),
    streakDays: profile?.streakDays || 0,
    freq,
  };
}

async function generateWithGroq(data) {
  if (!groq) return null;

  const emotionList = Object.entries(data.freq)
    .sort((a,b)=>b[1]-a[1])
    .map(([e,c]) => `${e}(${c})`)
    .join(", ") || "sin registros";

  const journalExcerpts = data.journals.slice(0, 3)
    .map(j => `"${j.title || 'sin título'}": ${j.content.substring(0,100)}`)
    .join(" | ") || "sin entradas";

  const prompt = `Eres Zyra — la mejor amiga de ${data.userName}. Tienes 24 años, eres colombiana, hablas directo y con calor humano real. Revisaste su semana y vas a contarle lo que viste.

DATOS DE LA SEMANA (${data.weekStart.toLocaleDateString("es-CO")} al ${data.weekEnd.toLocaleDateString("es-CO")}):
- Emociones registradas: ${emotionList}
- Tasa de positividad: ${data.positivity}%
- Score emocional promedio: ${data.avgScore} (rango -1 a +1)
- Sesiones de chat: ${data.sessionCount}
- Entradas de diario: ${data.journals.length}
- Metas completadas esta semana: ${data.completedGoals.length}
- Metas activas: ${data.activeGoals.map(g=>g.title).join(", ") || "ninguna"}
- Racha de días: ${data.streakDays} días
- Extractos del diario: ${journalExcerpts}

Genera el reporte en HTML con esta estructura:
- Párrafo de apertura: cómo fue la semana en 2-3 oraciones. Específico, honesto. Sin suavizar si fue difícil.
- Sección "Esta semana" con análisis real de las emociones registradas.
- Sección "Lo que sí hiciste" destacando logros concretos (metas, racha, diario).
- Sección "Lo que noté" con 2-3 patrones específicos basados en los datos.
- Sección "Para la próxima" con 2-3 sugerencias concretas y accionables — nada genérico.
- Párrafo de cierre: corto, directo, humano.

REGLAS DE VOZ (críticas):
- CERO frases de terapeuta: nada de "lo que sientes es válido", "eso tiene mucho sentido", "estoy aquí para acompañarte", "completamente normal"
- CERO exclamaciones vacías: nada de "¡Excelente!", "¡Genial!", "¡Increíble!", "¡Vas muy bien!"
- Habla EN PRIMERA PERSONA a ${data.userName} — "esta semana", "notaste", "hiciste", "vi que"
- Si la semana fue difícil, dilo sin rodeos — y propón algo específico
- Usa <p>, <h3>, <ul>, <li>, <strong>. Sin div, sin span.
- Máximo 400 palabras en total`;

  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 800,
  });

  return r.choices[0]?.message?.content?.trim() || null;
}

/* ── Generar reporte ── */
exports.generate = async (req, res) => {
  try {
    const weekOf = getMondayOf();
    weekOf.setDate(weekOf.getDate() - 7);

    // Si ya existe para esta semana, devolver el existente
    const existing = await WeeklyReport.findOne({
      user: req.user._id,
      weekOf: { $gte: new Date(weekOf.getTime() - 3600000) }
    }).lean();
    if (existing && !req.query.force) {
      return res.json({ success: true, report: existing, cached: true });
    }

    const data  = await buildReportData(req.user._id, req.user.name);
    const html  = await generateWithGroq(data);

    if (!html) {
      // Fallback sin IA
      const _goalsStr = data.completedGoals.length > 0
        ? `Completaste <strong>${data.completedGoals.length}</strong> meta${data.completedGoals.length !== 1 ? "s" : ""}. Eso cuenta. `
        : "";
      const fallback = `<p>Esta semana tuviste <strong>${data.history.length}</strong> registros emocionales con una positividad del <strong>${data.positivity}%</strong>. La emoción más frecuente fue <strong>${data.topEmotion}</strong>. ${_goalsStr}Sigue así.</p>`;
      const report = await WeeklyReport.findOneAndUpdate(
        { user: req.user._id, weekOf },
        { html: fallback, summary: `Semana ${data.positivity}% positiva`, mainEmotion: data.topEmotion, emotionData: data.freq, insights: [] },
        { upsert: true, new: true }
      );
      return res.json({ success: true, report, cached: false });
    }

    // Extraer insights del HTML generado
    const insightMatches = html.match(/<li>(.*?)<\/li>/gi) || [];
    const insights = insightMatches.slice(0, 5).map(m => m.replace(/<[^>]+>/g, "").trim());

    const report = await WeeklyReport.findOneAndUpdate(
      { user: req.user._id, weekOf },
      { html, summary: `Semana ${data.positivity}% positiva · ${data.topEmotion} predominante`, mainEmotion: data.topEmotion, emotionData: data.freq, insights, weekOf },
      { upsert: true, new: true }
    );

    // Enviar por email (fire-and-forget)
    if (process.env.EMAIL_USER) {
      sendWeeklyReport(req.user.email, req.user.name, html, data).catch(() => {});
    }

    res.json({ success: true, report, cached: false });
  } catch(e) {
    console.error("weeklyReport generate:", e.message);
    res.status(500).json({ message: e.message });
  }
};

/* ── Obtener historial de reportes ── */
exports.getHistory = async (req, res) => {
  try {
    const reports = await WeeklyReport.find({ user: req.user._id })
      .sort({ weekOf: -1 })
      .limit(12)
      .select("-html")
      .lean();
    res.json({ success: true, reports });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ── Obtener un reporte específico ── */
exports.getOne = async (req, res) => {
  try {
    const r = await WeeklyReport.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!r) return res.status(404).json({ message: "Reporte no encontrado" });
    res.json({ success: true, report: r });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ── Cron: generar reportes automáticos cada lunes ── */
exports.cronGenerateAll = async () => {
  const User = require("../models/User");
  const users = await User.find({ plan: { $in: ["basic","premium"] } }).lean();
  console.log(`📊 Generando reportes semanales para ${users.length} usuarios...`);
  let ok = 0;
  for (const u of users) {
    try {
      const data = await buildReportData(u._id, u.name);
      const html = await generateWithGroq(data);
      if (html) {
        const weekOf = getMondayOf();
        weekOf.setDate(weekOf.getDate() - 7);
        const insights = (html.match(/<li>(.*?)<\/li>/gi) || []).slice(0, 5).map(m => m.replace(/<[^>]+>/g, "").trim());
        await WeeklyReport.findOneAndUpdate(
          { user: u._id, weekOf },
          { html, mainEmotion: data.topEmotion, emotionData: data.freq, insights, weekOf },
          { upsert: true }
        );
        if (process.env.EMAIL_USER) {
          await sendWeeklyReport(u.email, u.name, html, data).catch(() => {});
        }
        ok++;
      }
    } catch(e) { console.error(`Report error for ${u._id}:`, e.message); }
  }
  console.log(`✅ Reportes generados: ${ok}/${users.length}`);
};
