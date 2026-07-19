const express    = require("express");
const router     = express.Router();
const { protect }     = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");
const Profile      = require("../models/Profile");
const Conversation = require("../models/Conversation");
const Goal         = require("../models/Goal");
const Journal      = require("../models/Journal");

const ELABELS = {
  feliz:"Feliz", triste:"Triste", ansioso:"Ansioso", enojado:"Enojado",
  tranquilo:"Tranquilo", estresado:"Estresado", emocionado:"Emocionado",
  cansado:"Cansado", motivado:"Motivado", solo:"Solo",
};
const ECOLORS = {
  feliz:"#f59e0b", triste:"#6366f1", ansioso:"#f97316", enojado:"#ef4444",
  tranquilo:"#10b981", estresado:"#dc2626", emocionado:"#ec4899",
  cansado:"#94a3b8", motivado:"#22c55e", solo:"#8b5cf6",
};

router.post("/pdf", protect, requirePlan("premium"), async (req, res) => {
  try {
    let PDFDocument;
    try { PDFDocument = require("pdfkit"); }
    catch(e) { return res.status(503).json({ message: "Modulo PDF no disponible. Intenta mas tarde." }); }

    const [pd, gd, jd, cd] = await Promise.all([
      Profile.findOne({ user: req.user._id }).select("emotionHistory").lean(),
      Goal.find({ user: req.user._id }).sort({ createdAt: -1 }).select("title completed createdAt").lean(),
      Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(6).select("title content createdAt emotion").lean(),
      Conversation.countDocuments({ user: req.user._id }),
    ]);

    const emotionHistory = (pd?.emotionHistory || []).slice(-60);
    const emotionCounts  = {};
    emotionHistory.forEach(e => { emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1; });
    const sortedEmotions = Object.entries(emotionCounts).sort((a,b) => b[1]-a[1]);
    const dominantEmotion = sortedEmotions[0]?.[0] || null;
    const goalsCompleted  = gd.filter(g => g.completed).length;
    const now     = new Date();
    const dateStr = now.toLocaleDateString("es-CO", { year:"numeric", month:"long", day:"numeric" });
    const name    = (req.user.name || "Usuario").slice(0, 50);

    const doc = new PDFDocument({
      size: "A4", margin: 0,
      info: { Title: `Reporte Zyra - ${name}`, Author: "Zyra IA", Subject: "Bienestar Emocional" }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `attachment; filename="zyra-reporte-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}.pdf"`);
    doc.pipe(res);

    const PW = 595.28;  // A4 width (pts)
    const ML = 44;      // left/right margin
    const CW = PW - ML*2;

    // ── CABECERA ──────────────────────────────────────────────────────────
    // Fondo principal purpura
    doc.rect(0, 0, PW, 88).fill("#4c1d95");
    // Banda decorativa izquierda
    doc.rect(0, 0, 5, 88).fill("#ec4899");
    // Banda de acento derecho
    doc.rect(PW - 5, 0, 5, 88).fill("#8b5cf6");

    // Marca
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(24).text("Zyra", ML, 18);
    doc.fillColor("#c4b5fd").font("Helvetica").fontSize(9)
       .text("Bienestar Emocional con Inteligencia Artificial", ML, 46);

    // Nombre y fecha a la derecha
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12)
       .text(name, 0, 20, { width: PW - ML, align: "right" });
    doc.fillColor("#c4b5fd").font("Helvetica").fontSize(8.5)
       .text("Generado el " + dateStr, 0, 38, { width: PW - ML, align: "right" });

    // Banda subtitulo
    doc.rect(0, 88, PW, 22).fill("#5b21b6");
    doc.fillColor("#ede9fe").font("Helvetica-Bold").fontSize(8.5)
       .text("RESUMEN PERSONAL DE BIENESTAR EMOCIONAL", 0, 95, { width: PW, align: "center" });

    let Y = 124;

    // ── ESTADISTICAS ──────────────────────────────────────────────────────
    const stats = [
      { label: "Sesiones de chat",  value: String(cd),            color: "#6366f1" },
      { label: "Metas creadas",     value: String(gd.length),     color: "#0ea5e9" },
      { label: "Metas logradas",    value: String(goalsCompleted), color: "#22c55e" },
      { label: "Check-ins",         value: String(emotionHistory.length), color: "#f59e0b" },
    ];
    const sw = (CW - 9) / 4;
    stats.forEach((s, i) => {
      const sx = ML + i * (sw + 3);
      doc.rect(sx, Y, sw, 60).fill("#f8fafc");
      doc.rect(sx, Y, sw, 3).fill(s.color);
      doc.fillColor(s.color).font("Helvetica-Bold").fontSize(24)
         .text(s.value, sx, Y + 10, { width: sw, align: "center" });
      doc.fillColor("#64748b").font("Helvetica").fontSize(7.5)
         .text(s.label, sx, Y + 42, { width: sw, align: "center" });
    });
    Y += 76;

    // ── MAPA EMOCIONAL ────────────────────────────────────────────────────
    if (sortedEmotions.length > 0) {
      // Cabecera de seccion
      doc.rect(ML, Y, CW, 18).fill("#ede9fe");
      doc.rect(ML, Y, 4, 18).fill("#6366f1");
      doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(8.5)
         .text("MAPA EMOCIONAL", ML + 10, Y + 5);
      Y += 26;

      // Recuadro emocion dominante
      if (dominantEmotion) {
        const dc = ECOLORS[dominantEmotion] || "#6366f1";
        const dl = ELABELS[dominantEmotion] || dominantEmotion;
        doc.rect(ML, Y, CW, 26).fill("#fafafa");
        doc.rect(ML, Y, 4, 26).fill(dc);
        doc.fillColor("#64748b").font("Helvetica").fontSize(8.5)
           .text("Emocion mas frecuente:", ML + 12, Y + 4);
        doc.fillColor(dc).font("Helvetica-Bold").fontSize(10.5)
           .text(dl.toUpperCase(), ML + 140, Y + 3);
        doc.fillColor("#94a3b8").font("Helvetica").fontSize(7.5)
           .text("(" + (emotionCounts[dominantEmotion] || 0) + " registros)", ML + 140, Y + 15);
        Y += 34;
      }

      // Grafico de barras horizontales
      const maxC    = sortedEmotions[0][1];
      const barMaxW = CW - 90;
      const barH    = 12;
      doc.fillColor("#94a3b8").font("Helvetica").fontSize(7)
         .text("EMOCION", ML, Y).text("FRECUENCIA", ML + 76, Y);
      Y += 12;

      sortedEmotions.slice(0, 8).forEach(([em, cnt]) => {
        const bc  = ECOLORS[em] || "#6366f1";
        const bw  = Math.max(6, Math.round((cnt / maxC) * barMaxW));
        const lbl = ELABELS[em] || em;
        // Label
        doc.fillColor("#475569").font("Helvetica").fontSize(8)
           .text(lbl, ML, Y + 2, { width: 72 });
        // Track (fondo)
        doc.rect(ML + 76, Y, barMaxW, barH).fill("#f1f5f9");
        // Barra coloreada
        doc.rect(ML + 76, Y, bw, barH).fill(bc);
        // Numero
        doc.fillColor("#475569").font("Helvetica").fontSize(7.5)
           .text(String(cnt), ML + 76 + barMaxW + 6, Y + 2);
        Y += barH + 5;
      });
      Y += 14;
    }

    // ── METAS ─────────────────────────────────────────────────────────────
    if (gd.length > 0) {
      if (Y > 660) { doc.addPage(); Y = ML; }

      doc.rect(ML, Y, CW, 18).fill("#e0f2fe");
      doc.rect(ML, Y, 4, 18).fill("#0284c7");
      doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(8.5)
         .text("METAS PERSONALES", ML + 10, Y + 5);
      Y += 26;

      const done = gd.filter(g => g.completed);
      const pend = gd.filter(g => !g.completed);

      if (done.length > 0) {
        doc.fillColor("#16a34a").font("Helvetica-Bold").fontSize(8).text("Completadas", ML, Y);
        Y += 14;
        done.slice(0, 10).forEach(g => {
          if (Y > 770) { doc.addPage(); Y = ML; }
          doc.rect(ML, Y + 1, 7, 7).fill("#22c55e");
          doc.fillColor("#1e293b").font("Helvetica").fontSize(8.5)
             .text((g.title || "").slice(0, 85), ML + 14, Y, { width: CW - 14 });
          Y += 14;
        });
        Y += 6;
      }

      if (pend.length > 0) {
        doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(8).text("En progreso", ML, Y);
        Y += 14;
        pend.slice(0, 10).forEach(g => {
          if (Y > 770) { doc.addPage(); Y = ML; }
          // Cuadrado vacio (borde gris)
          doc.rect(ML, Y + 1, 7, 7).fillAndStroke("#f8fafc", "#94a3b8");
          doc.fillColor("#64748b").font("Helvetica").fontSize(8.5)
             .text((g.title || "").slice(0, 85), ML + 14, Y, { width: CW - 14 });
          Y += 14;
        });
      }
      Y += 14;
    }

    // ── DIARIO ────────────────────────────────────────────────────────────
    if (jd.length > 0) {
      if (Y > 640) { doc.addPage(); Y = ML; }

      doc.rect(ML, Y, CW, 18).fill("#fce7f3");
      doc.rect(ML, Y, 4, 18).fill("#db2777");
      doc.fillColor("#831843").font("Helvetica-Bold").fontSize(8.5)
         .text("ENTRADAS DEL DIARIO", ML + 10, Y + 5);
      Y += 26;

      jd.forEach(j => {
        const snippet   = (j.content || "").slice(0, 220);
        const lineCount = Math.ceil(snippet.length / 88) || 1;
        const cardH     = 14 + 12 + lineCount * 10 + 16;
        if (Y + cardH > 790) { doc.addPage(); Y = ML; }

        doc.rect(ML, Y, CW, cardH).fill("#fdf4ff");
        doc.rect(ML, Y, 4, cardH).fill("#db2777");

        const d = new Date(j.createdAt).toLocaleDateString("es-CO",
          { year:"numeric", month:"short", day:"numeric" });
        const emL = j.emotion ? (ELABELS[j.emotion] || j.emotion) : "";

        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(9)
           .text((j.title || "Sin titulo").slice(0, 65), ML + 10, Y + 7);
        doc.fillColor("#94a3b8").font("Helvetica").fontSize(7)
           .text(d + (emL ? "  |  " + emL : ""), ML + 10, Y + 20);
        doc.fillColor("#475569").font("Helvetica").fontSize(8.5)
           .text(snippet + (snippet.length < (j.content||"").length ? "..." : ""),
                 ML + 10, Y + 32, { width: CW - 20 });
        Y += cardH + 8;
      });
    }

    // ── PIE DE PAGINA ─────────────────────────────────────────────────────
    // Siempre al final del ultimo contenido, no fijo en la pagina
    Y += 20;
    if (Y > 790) { doc.addPage(); Y = ML; }
    doc.rect(ML, Y, CW, 1).fill("#e2e8f0");
    doc.fillColor("#94a3b8").font("Helvetica").fontSize(7.5)
       .text(
         "Este reporte es generado automaticamente por Zyra IA y no reemplaza la orientacion de un profesional de salud mental.",
         ML, Y + 8, { width: CW, align: "center" })
       .text("Zyra IA  -  Tu companera de bienestar emocional", ML, Y + 20, { width: CW, align: "center" });

    doc.end();
  } catch(e) {
    console.error("[report/pdf]", e.message);
    if (!res.headersSent) res.status(500).json({ message: "Error generando el reporte. Intenta de nuevo." });
  }
});

module.exports = router;
