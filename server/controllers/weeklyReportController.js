const WeeklyReport = require("../models/WeeklyReport");
const Profile      = require("../models/Profile");
const Goal         = require("../models/Goal");
const Journal      = require("../models/Journal");
const Conversation = require("../models/Conversation");
const { sendWeeklyReport, sendSharedWeeklyReport } = require("../utils/emailService");
const HRGuide      = require("../../client/hr-guide"); // "Tu corazón esta semana" (misma cuenta que la app)

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;


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
    Profile.findOne({ user: userId }).select("emotionHistory streakDays health.history health.checkins health.breaths nickname gender").lean(),
    Goal.find({ user: userId }).select("title completed updatedAt").lean(),
    Journal.find({ user: userId, createdAt: { $gte: weekStart, $lt: weekEnd } }).select("title content createdAt").lean(),
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

  // Cruce pulso (reloj) x emocion por dia -- le da a Zyra una observacion real
  // en vez de solo la lista de emociones sueltas ("tu pulso bajo los dias que
  // marcaste calma"). Solo se arma si el usuario de verdad tiene reloj conectado.
  const hrByDate = {};
  (profile?.health?.history || []).forEach(d => { if (d.avgHR) hrByDate[d.date] = d.avgHR; });
  const hrEmotionDays = history
    .map(h => {
      const dateStr = new Date(h.date).toDateString();
      const avgHR = hrByDate[dateStr];
      return avgHR ? { emotion: h.emotion, avgHR } : null;
    })
    .filter(Boolean);

  // Patron por dia de semana usando el HISTORIAL COMPLETO (no solo la ultima
  // semana) -- con una sola semana de datos no alcanza senal para decir "los
  // martes te cuesta mas". Esto es lo que convierte el reporte de "que paso"
  // a "que hacer": si hay un dia con patron negativo claro y reciente, se lo
  // decimos a Zyra para que arme el plan de la semana que ENTRA alrededor de
  // ese dia, no de forma generica.
  const fullHistory = (profile?.emotionHistory || []).slice(-120); // ultimos ~4 meses de registros
  const dayBuckets = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  fullHistory.forEach(h => {
    const d = new Date(h.date).getDay();
    dayBuckets[d].total += emotionScore(h.emotion);
    dayBuckets[d].count += 1;
  });
  const DAY_ES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  let worstDayPattern = null;
  dayBuckets.forEach((b, i) => {
    if (b.count < 3) return; // necesita al menos 3 registros ese dia para ser un patron, no ruido
    const avg = b.total / b.count;
    if (avg < -0.15 && (!worstDayPattern || avg < worstDayPattern.score)) {
      worstDayPattern = { day: DAY_ES[i], score: Number(avg.toFixed(2)), samples: b.count };
    }
  });

  // La meta activa mas vieja sin avance -- para darle a "el plan" algo
  // concreto y propio de la persona, no un consejo generico de bienestar.
  const stalledGoal = goals
    .filter(g => !g.completed)
    .sort((a,b) => new Date(a.updatedAt) - new Date(b.updatedAt))[0] || null;

  // "Tu corazón esta semana": pulso en reposo y su tendencia, check-ins, respiraciones con
  // reloj y pulso según la emoción. null si la persona no tiene datos de pulso.
  const heart = HRGuide.weeklyHeart({
    checkins: profile?.health?.checkins, history: profile?.health?.history,
    breaths: profile?.health?.breaths, now: weekEnd,
  });

  return {
    // Cómo llamarle: el apodo de "Sobre ti" o, si no hay, su primer nombre
    userName: (profile?.nickname || "").trim() || String(userName || "").split(" ")[0] || "tú",
    gender: profile?.gender || null,
    weekStart, weekEnd, history, topEmotion, positivity, heart,
    avgScore: Number(avgScore), journals, sessionCount,
    completedGoals: completedThisWeek,
    activeGoals: goals.filter(g => !g.completed).slice(0, 5),
    streakDays: profile?.streakDays || 0,
    freq, hrEmotionDays, worstDayPattern, stalledGoal,
  };
}

async function generateWithGroq(data) {
  const emotionList = Object.entries(data.freq)
    .sort((a,b)=>b[1]-a[1])
    .map(([e,c]) => `${e}(${c})`)
    .join(", ") || "sin registros";

  const journalExcerpts = data.journals.slice(0, 3)
    .map(j => `"${j.title || 'sin título'}": ${j.content.substring(0,100)}`)
    .join(" | ") || "sin entradas";

  // Solo se agrega si el usuario de verdad tiene reloj conectado con datos
  // reales esta semana -- si no hay nada, mejor omitir la linea por completo
  // a que el modelo invente una correlacion de datos que no existen.
  const hrEmotionLine = data.hrEmotionDays.length >= 2
    ? `\n- Pulso promedio por día según el reloj, cruzado con la emoción registrada ese día: ${data.hrEmotionDays.map(d => `${d.emotion} (${d.avgHR} bpm)`).join(", ")}`
    : "";

  const worstDayLine = data.worstDayPattern
    ? `\n- Patrón detectado (últimos meses, no solo esta semana): los ${data.worstDayPattern.day}s tienden a ser más difíciles (${data.worstDayPattern.samples} registros con score promedio ${data.worstDayPattern.score})`
    : "";

  const heartLine = data.heart
    ? `
- Corazón (reloj y check-in cuerpo y mente): ${data.heart.summary}. Meta sugerida para la semana: ${data.heart.goal.text}`
    : "";

  const stalledGoalLine = data.stalledGoal
    ? `\n- Meta activa que lleva más tiempo sin marcarse como avance: "${data.stalledGoal.title}"`
    : "";

  const prompt = `Eres Zyra, la IA amiga de ${data.userName}. Hablas como una amiga colombiana: directo y con calor humano real. Revisaste su semana y vas a contarle lo que viste — y lo más importante, le vas a armar un plan concreto para la semana que ENTRA.

DATOS DE LA SEMANA QUE PASÓ (${data.weekStart.toLocaleDateString("es-CO")} al ${data.weekEnd.toLocaleDateString("es-CO")}):
- Emociones registradas: ${emotionList}
- Tasa de positividad: ${data.positivity}%
- Score emocional promedio: ${data.avgScore} (rango -1 a +1)
- Sesiones de chat: ${data.sessionCount}
- Entradas de diario: ${data.journals.length}
- Metas completadas esta semana: ${data.completedGoals.length}
- Metas activas: ${data.activeGoals.map(g=>g.title).join(", ") || "ninguna"}
- Racha de días: ${data.streakDays} días
- Extractos del diario: ${journalExcerpts}${hrEmotionLine}${heartLine}${worstDayLine}${stalledGoalLine}

Genera el reporte en HTML con esta estructura:
- Párrafo de apertura: cómo fue la semana en 2-3 oraciones. Específico, honesto. Sin suavizar si fue difícil.
- Sección "Esta semana" con análisis real de las emociones registradas.
- Sección "Lo que sí hiciste" destacando logros concretos (metas, racha, diario).
- Sección "Lo que noté" con 2-3 patrones específicos basados en los datos${data.hrEmotionDays.length >= 2 ? " (si el pulso del reloj varía claramente según la emoción del día, menciónalo — es un dato real, no lo inventes si no está arriba)" : ""}${data.heart ? " Si hay datos del corazón, menciona en una frase cómo va su pulso en reposo (si bajó, reconócelo; si subió, sin alarmar), sin diagnosticar nada" : ""}.
- Sección "Tu plan para esta semana" — NO es una lista de consejos genéricos de bienestar. Son 2-3 acciones puntuales, atadas a datos reales de arriba:
  ${data.worstDayPattern ? `· Como los ${data.worstDayPattern.day}s tienden a pesar más, sugiere algo concreto para ESE día específico de la semana que entra (ej: bloquear un espacio corto, anticipar el desgaste, etc.) — no un consejo para "todos los días".` : "· Si no hay un día con patrón claro, no inventes uno — da una sugerencia concreta basada en otro dato de arriba."}
  ${data.stalledGoal ? `· Menciona la meta estancada ("${data.stalledGoal.title}") y propón UN paso pequeño y específico para esta semana, no "sigue intentando".` : ""}
  · El resto puede tocar diario, chat o lo que haga falta según los datos — pero siempre con un verbo de acción y, si aplica, un día o momento concreto.
- Párrafo de cierre: corto, directo, humano.

REGLAS DE VOZ (críticas):
- CERO frases de terapeuta: nada de "lo que sientes es válido", "eso tiene mucho sentido", "estoy aquí para acompañarte", "completamente normal"
- CERO exclamaciones vacías: nada de "¡Excelente!", "¡Genial!", "¡Increíble!", "¡Vas muy bien!"
- Habla EN PRIMERA PERSONA a ${data.userName} — "esta semana", "notaste", "hiciste", "vi que"
- ${data.gender === "mujer" ? "Es mujer: usa femenino (\"cansada\", \"tranquila\")." : data.gender === "hombre" ? "Es hombre: usa masculino (\"cansado\", \"tranquilo\")." : "No adivines su género: usa frases sin adjetivos con género (\"te noté con cansancio\" en vez de \"cansado\" o \"cansada\")."}
- Si la semana fue difícil, dilo sin rodeos — y propón algo específico
- Usa <p>, <h3>, <ul>, <li>, <strong>. Sin div, sin span.
- Máximo 480 palabras en total`;

  // El modelo grande de Groq primero (mejor redacción) y, si está sin cupo, Gemini y el chico,
  // sin esperas: antes solo Groq, y si se le acababa el cupo el reporte no salía
  let text = null;
  try {
    text = await require("../utils/ai").complete([{ role: "user", content: prompt }], {
      order: ["openai/gpt-oss-120b", "gemini", "openai/gpt-oss-20b"],
      temperature: 0.7, maxTokens: 1100, timeoutMs: 30000,
    });
  } catch (e) { console.error("Reporte semanal (IA):", e.message); }
  if (text) {
    // El modelo a veces envuelve la respuesta en un bloque de código markdown
    // (```html ... ```) aunque se le pide HTML crudo -- se quita por si acaso,
    // si no queda "```html" como texto visible al inicio del reporte.
    text = text.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  }
  return text;
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
    // Un fallo de red hacia Groq no debe tumbar el endpoint -- cae al reporte
    // sin IA de más abajo, igual que cuando Groq simplemente no responde nada.
    const html  = await generateWithGroq(data).catch(e => { console.error("generateWithGroq:", e.message); return null; });

    if (!html) {
      // Fallback sin IA
      const _goalsStr = data.completedGoals.length > 0
        ? `Completaste <strong>${data.completedGoals.length}</strong> meta${data.completedGoals.length !== 1 ? "s" : ""}. Eso cuenta. `
        : "";
      const fallback = `<p>Esta semana tuviste <strong>${data.history.length}</strong> registros emocionales con una positividad del <strong>${data.positivity}%</strong>. La emoción más frecuente fue <strong>${data.topEmotion}</strong>. ${_goalsStr}Sigue así.</p>`;
      const report = await WeeklyReport.findOneAndUpdate(
        { user: req.user._id, weekOf },
        { html: fallback, summary: `Semana ${data.positivity}% positiva`, mainEmotion: data.topEmotion, emotionData: data.freq, insights: [], heart: data.heart },
        { upsert: true, new: true }
      );
      return res.json({ success: true, report, cached: false });
    }

    // Extraer insights del HTML generado
    const insightMatches = html.match(/<li>(.*?)<\/li>/gi) || [];
    const insights = insightMatches.slice(0, 5).map(m => m.replace(/<[^>]+>/g, "").trim());

    const report = await WeeklyReport.findOneAndUpdate(
      { user: req.user._id, weekOf },
      { html, summary: `Semana ${data.positivity}% positiva · ${data.topEmotion} predominante`, mainEmotion: data.topEmotion, emotionData: data.freq, insights, weekOf, heart: data.heart },
      { upsert: true, new: true }
    );

    // Enviar por email (fire-and-forget)
    if (process.env.EMAIL_USER) {
      sendWeeklyReport(req.user.email, data.userName, html, data).catch(() => {});
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

/* ── Compartir un reporte con alguien más (psicólogo, familiar, consejero) ── */
exports.shareReport = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const name  = String(req.body.name || "").trim().slice(0, 100);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Correo inválido" });
    }

    const report = await WeeklyReport.findOne({ _id: req.params.id, user: req.user._id });
    if (!report) return res.status(404).json({ message: "Reporte no encontrado" });

    await sendSharedWeeklyReport(email, name, req.user.name, report);

    report.shares.push({ email, name, sentAt: new Date() });
    await report.save();

    res.json({ success: true, shares: report.shares });
  } catch(e) {
    console.error("shareReport:", e.message);
    res.status(500).json({ message: "No se pudo enviar el reporte. Intenta de nuevo." });
  }
};

/* ── Cron: generar reportes automáticos cada lunes ── */
exports.cronGenerateAll = async () => {
  const User      = require("../models/User");
  const { sendToUser } = require("./pushController");
  const { QA_EMAIL_RE } = require("../utils/testAccounts");
  // Solo planes pagos vigentes (misma regla que planGate: sin fecha = vigente). El plan
  // vencido solo vuelve a "free" cuando el usuario abre una función paga; sin este
  // filtro, quien dejó de usar la app seguía recibiendo el reporte cada lunes.
  // Las cuentas QA se omiten para no gastar llamadas a Groq.
  const now = new Date();
  const users = await User.find({
    plan: { $in: ["basic","premium"] },
    $or: [{ planExpiresAt: null }, { planExpiresAt: { $gt: now } }],
    email: { $not: QA_EMAIL_RE },
  }).select("_id name email").lean();
  console.log(`📊 Generando reportes semanales para ${users.length} usuarios...`);
  let ok = 0;
  const weekOf = getMondayOf();
  weekOf.setDate(weekOf.getDate() - 7);
  for (const u of users) {
    try {
      const data = await buildReportData(u._id, u.name);
      const html = await generateWithGroq(data);
      if (html) {
        const insights = (html.match(/<li>(.*?)<\/li>/gi) || []).slice(0, 5).map(m => m.replace(/<[^>]+>/g, "").trim());
        await WeeklyReport.findOneAndUpdate(
          { user: u._id, weekOf },
          { html, mainEmotion: data.topEmotion, emotionData: data.freq, insights, weekOf, heart: data.heart },
          { upsert: true }
        );
        if (process.env.EMAIL_USER) {
          await sendWeeklyReport(u.email, data.userName, html, data).catch(() => {});
        }
        // Push notification: report is ready
        const firstName = (u.name || "").split(" ")[0] || "hola";
        const topEmo = data.topEmotion || "";
        const EMO_LABELS = { feliz:"feliz", tranquilo:"tranquilo/a", ansioso:"ansioso/a", triste:"con tristeza", enojado:"enojado/a", confundido:"confundido/a", esperanzado:"esperanzado/a", agotado:"agotado/a", motivado:"motivado/a", nostalgico:"nostálgico/a" };
        const body = topEmo && EMO_LABELS[topEmo]
          ? `Tu semana en resumen: tu emoción más frecuente fue "${EMO_LABELS[topEmo]}". Lee el análisis completo.`
          : "Tu resumen semanal está listo. Revisa cómo fue tu semana.";
        await sendToUser(u._id, {
          title: "📊 Tu reporte semanal llegó",
          body,
          icon:  "/Imagenes/logo-nuevo.png",
          badge: "/Imagenes/logo-nuevo.png",
          tag:   "zyra-weekly-report",
          data:  { url: "/?p=weekly-report" },
        }).catch(() => {});
        ok++;
      }
    } catch(e) { console.error(`Report error for ${u._id}:`, e.message); }
    // Avoid hammering Groq rate limits between users
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`✅ Reportes generados: ${ok}/${users.length}`);
};
