const Profile     = require("../models/Profile");
const Goal        = require("../models/Goal");
const Journal     = require("../models/Journal");
const Conversation= require("../models/Conversation");

const POSITIVE = new Set(["feliz","tranquilo","esperanzado","motivado"]);
const NEGATIVE  = new Set(["ansioso","triste","enojado","agotado","confundido"]);
const DAYS_ES   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const EMOTION_LABELS = {
  feliz:"Feliz", tranquilo:"Tranquilo", ansioso:"Ansioso", triste:"Triste",
  enojado:"Enojado", confundido:"Confundido", esperanzado:"Esperanzado",
  agotado:"Agotado", motivado:"Motivado", nostalgico:"Nostálgico",
};

function emotionScore(e) {
  if (POSITIVE.has(e)) return 1;
  if (NEGATIVE.has(e))  return -1;
  return 0;
}

exports.getOverview = async (req, res) => {
  try {
    const [profile, goals, journals, conversations] = await Promise.all([
      Profile.findOne({ user: req.user._id }).lean(),
      Goal.find({ user: req.user._id }).lean(),
      Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(90).lean(),
      Conversation.find({ user: req.user._id }).lean(),
    ]);

    const history = profile?.emotionHistory || [];

    // ── Frecuencia de emociones ──
    const freq = {};
    history.forEach(h => { freq[h.emotion] = (freq[h.emotion] || 0) + 1; });
    const emotionFrequency = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([emotion, count]) => ({ emotion, label: EMOTION_LABELS[emotion] || emotion, count }));

    // ── Patrón por día de semana ──
    const dayScores = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
    history.forEach(h => {
      const d = new Date(h.date).getDay();
      dayScores[d].total += emotionScore(h.emotion);
      dayScores[d].count += 1;
    });
    const dayOfWeekPattern = dayScores.map((d, i) => ({
      day: DAYS_ES[i],
      dayShort: DAYS_ES[i].substring(0, 3),
      score: d.count > 0 ? +(d.total / d.count).toFixed(2) : null,
      count: d.count,
    }));

    // ── Tendencia últimas 4 semanas ──
    const now = Date.now();
    const weeklyTrend = Array.from({ length: 4 }, (_, i) => {
      const start = now - (4 - i) * 7 * 86400000;
      const end   = start + 7 * 86400000;
      const week  = history.filter(h => {
        const t = new Date(h.date).getTime();
        return t >= start && t < end;
      });
      const score = week.length > 0
        ? +(week.reduce((s, h) => s + emotionScore(h.emotion), 0) / week.length).toFixed(2)
        : null;
      const d = new Date(start);
      return { week: `${d.getDate()}/${d.getMonth()+1}`, score, count: week.length };
    });

    // ── Mejores y peores días ──
    const validDays = dayOfWeekPattern.filter(d => d.count >= 2);
    const bestDay  = validDays.length ? validDays.reduce((a, b) => (b.score ?? -99) > (a.score ?? -99) ? b : a) : null;
    const worstDay = validDays.length ? validDays.reduce((a, b) => (b.score ?? 99) < (a.score ?? 99) ? b : a) : null;

    // ── Hora del día ──
    const hourCounts = Array(24).fill(0);
    history.forEach(h => { hourCounts[new Date(h.date).getHours()]++; });
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // ── Stats generales ──
    const completedGoals = goals.filter(g => g.completed).length;
    const totalGoals     = goals.length;
    const positiveCount  = history.filter(h => POSITIVE.has(h.emotion)).length;
    const positivityRate = history.length > 0
      ? Math.round((positiveCount / history.length) * 100)
      : 0;

    // ── Intensidad promedio ──
    const avgIntensity = history.length > 0
      ? +(history.reduce((s, h) => s + (h.intensity || 5), 0) / history.length).toFixed(1)
      : 5;

    // ── Racha de diario ──
    let journalStreak = 0;
    if (journals.length) {
      const today = new Date().toDateString();
      const dates  = [...new Set(journals.map(j => new Date(j.createdAt).toDateString()))];
      for (let i = 0; i < dates.length; i++) {
        const expected = new Date(Date.now() - i * 86400000).toDateString();
        if (dates[i] === expected) journalStreak++;
        else break;
      }
    }

    // ── Insight generado ──
    let insight = null;
    const timeLabel = peakHour < 12 ? "mañanas" : peakHour < 17 ? "tardes" : "noches";
    if (bestDay && bestDay.score !== null && bestDay.score > 0) {
      insight = `Los ${bestDay.day.toLowerCase()} tienden a ser tus mejores días. Cuando puedas, aprovéchalos.`;
    } else if (worstDay && worstDay.score !== null && worstDay.score < 0) {
      insight = `Los ${worstDay.day.toLowerCase()} suelen ser más pesados. Vale la pena cuidarte un poco más ese día.`;
    } else if (positivityRate >= 60) {
      insight = `El ${positivityRate}% de tus registros han sido positivos. Eso no es poca cosa.`;
    } else if (history.length > 5) {
      insight = `Registras más por las ${timeLabel}. Es cuando más procesas el día — y eso tiene sentido.`;
    }

    // ── Word frequency from journals ──
    const STOP_WORDS = new Set([
      "y","de","el","la","que","en","a","los","las","un","una","es","se","no","del","al",
      "lo","me","mi","por","con","su","como","pero","más","ya","fue","ha","le","te","si",
      "para","esto","hay","ser","muy","todo","también","cuando","porque","puede","tiene",
      "hacer","hoy","día","días","siento","estoy","era","han","esta","este","son","tan"
    ]);
    const wordFreq = {};
    journals.forEach(j => {
      const text = ((j.title || "") + " " + (j.content || "")).toLowerCase();
      text.replace(/[^a-záéíóúüñ\s]/gi, "").split(/\s+/).forEach(w => {
        if (w.length >= 4 && !STOP_WORDS.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
      });
    });
    const topWords = Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([word,count])=>({word,count}));

    // ── Activity dates (last 90 days) for streak heatmap ──
    const cutoff90 = new Date(Date.now() - 90 * 86400000);
    const toDateStr = d => new Date(d).toISOString().slice(0, 10);
    const activeDatesSet = new Set();
    conversations.forEach(c => { if (new Date(c.updatedAt) >= cutoff90) activeDatesSet.add(toDateStr(c.updatedAt)); });
    journals.forEach(j => { if (new Date(j.createdAt) >= cutoff90) activeDatesSet.add(toDateStr(j.createdAt)); });
    history.forEach(h => { if (new Date(h.date) >= cutoff90) activeDatesSet.add(toDateStr(h.date)); });
    const activityDates = [...activeDatesSet];

    res.json({
      success: true,
      stats: {
        totalEntries:    history.length,
        totalSessions:   profile?.sessionsCount || conversations.length,
        totalGoals,
        completedGoals,
        journalEntries:  journals.length,
        streakDays:      profile?.streakDays || 0,
        journalStreak,
        positivityRate,
        avgIntensity,
        peakHour: `${peakHour}:00`,
      },
      emotionFrequency,
      dayOfWeekPattern,
      weeklyTrend,
      bestDay,
      worstDay,
      insight,
      topWords,
      activityDates,
    });
  } catch(e) {
    console.error("analytics:", e.message);
    res.status(500).json({ message: e.message });
  }
};
