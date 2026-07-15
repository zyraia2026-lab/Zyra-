const express = require("express");
const router  = express.Router();
const { protect }      = require("../middleware/auth");
const { requirePlan }  = require("../middleware/planGate");
const Profile      = require("../models/Profile");
const Conversation = require("../models/Conversation");
const Goal         = require("../models/Goal");
const Journal      = require("../models/Journal");

const EMOTION_LABELS = {
  feliz:"Feliz", triste:"Triste", ansioso:"Ansioso", enojado:"Enojado",
  tranquilo:"Tranquilo", estresado:"Estresado", emocionado:"Emocionado",
  cansado:"Cansado", motivado:"Motivado", solo:"Solo",
};
const EMOTION_EMOJIS = {
  feliz:"😊", triste:"😔", ansioso:"😰", enojado:"😠", tranquilo:"😌",
  estresado:"😤", emocionado:"🤩", cansado:"😴", motivado:"💪", solo:"🥺",
};

router.post("/pdf", protect, requirePlan("premium"), async (req, res) => {
  try {
    let PDFDocument;
    try {
      PDFDocument = require("pdfkit");
    } catch(e) {
      return res.status(503).json({ message: "Módulo PDF no disponible. Por favor intenta más tarde." });
    }

    const [pd, gd, jd, cd] = await Promise.all([
      Profile.findOne({ user: req.user._id }).select("emotionHistory").lean(),
      Goal.find({ user: req.user._id }).sort({ createdAt: -1 }).select("title completed").lean(),
      Journal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10).select("content createdAt").lean(),
      Conversation.countDocuments({ user: req.user._id }),
    ]);

    const emotionHistory = (pd?.emotionHistory || []).slice(-30);
    const emotionCounts  = {};
    emotionHistory.forEach(e => { emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1; });
    const dominantEmotion = Object.entries(emotionCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "N/A";
    const goalsCompleted  = gd.filter(g => g.completed).length;
    const now             = new Date();
    const dateStr         = now.toLocaleDateString("es-CO", { year:"numeric", month:"long", day:"numeric" });

    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Reporte Zyra — ${req.user.name}`, Author: "Zyra IA" } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=zyra-reporte-${Date.now()}.pdf`);
    doc.pipe(res);

    // ── Header
    doc.rect(0, 0, 595, 90).fill("#6366f1");
    doc.fillColor("white").fontSize(26).font("Helvetica-Bold").text("Zyra", 50, 25);
    doc.fontSize(11).font("Helvetica").text("Tu resumen personal de bienestar", 50, 55);
    doc.fontSize(9).text(`Generado el ${dateStr}`, 50, 70);
    doc.fillColor("#1e293b");

    // ── Title
    doc.moveDown(2);
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#6366f1")
       .text(`Reporte de Bienestar — ${req.user.name}`, 50, 110, { align: "center" });

    // ── Summary stats
    doc.moveDown(1.2);
    const statsY = doc.y;
    const boxW   = 115;
    const gap    = 10;
    const stats  = [
      { label: "Sesiones", value: String(cd) },
      { label: "Metas creadas", value: String(gd.length) },
      { label: "Metas logradas", value: String(goalsCompleted) },
      { label: "Emoción frecuente", value: EMOTION_LABELS[dominantEmotion] || dominantEmotion },
    ];
    stats.forEach((s, i) => {
      const x = 50 + i * (boxW + gap);
      doc.rect(x, statsY, boxW, 60).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fillColor("#6366f1").fontSize(20).font("Helvetica-Bold").text(s.value, x, statsY + 8, { width: boxW, align: "center" });
      doc.fillColor("#64748b").fontSize(9).font("Helvetica").text(s.label, x, statsY + 34, { width: boxW, align: "center" });
    });

    // ── Emotion history
    doc.moveDown(0.5).y = statsY + 80;
    doc.fillColor("#1e293b").fontSize(14).font("Helvetica-Bold").text("Historial de Emociones (últimos 30 registros)", 50);
    doc.moveDown(0.4);
    if (emotionHistory.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#94a3b8").text("No hay registros de emociones aún.", 50);
    } else {
      const colW  = 75;
      const rowH  = 20;
      const cols  = Math.min(7, emotionHistory.length);
      emotionHistory.slice(-cols * 4).forEach((e, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = 50 + col * colW;
        const y   = doc.y + row * rowH;
        const label = EMOTION_LABELS[e.emotion] || e.emotion;
        const emoji  = EMOTION_EMOJIS[e.emotion] || "•";
        const d      = new Date(e.date).toLocaleDateString("es-CO", { month:"short", day:"numeric" });
        doc.fontSize(9).font("Helvetica").fillColor("#475569")
           .text(`${emoji} ${label}`, x, y, { width: colW - 4 })
           .fontSize(7).fillColor("#94a3b8").text(d, x, y + 10, { width: colW - 4 });
      });
      doc.moveDown(Math.ceil(Math.min(emotionHistory.length, 28) / cols) * 1.5);
    }

    // ── Goals
    doc.moveDown(0.8);
    doc.fillColor("#1e293b").fontSize(14).font("Helvetica-Bold").text("Metas Personales");
    doc.moveDown(0.4);
    if (gd.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#94a3b8").text("No hay metas registradas.");
    } else {
      gd.slice(0, 10).forEach(g => {
        const mark = g.completed ? "✓" : "○";
        const col  = g.completed ? "#22c55e" : "#94a3b8";
        doc.fontSize(10).font("Helvetica-Bold").fillColor(col).text(mark + " ", { continued: true })
           .font("Helvetica").fillColor("#1e293b").text(g.title);
      });
    }

    // ── Journal snippets
    if (jd.length > 0) {
      doc.moveDown(0.8);
      doc.fillColor("#1e293b").fontSize(14).font("Helvetica-Bold").text("Entradas Recientes del Diario");
      doc.moveDown(0.4);
      jd.slice(0, 5).forEach(j => {
        const d   = new Date(j.createdAt).toLocaleDateString("es-CO", { year:"numeric", month:"short", day:"numeric" });
        const txt = (j.content || "").slice(0, 200) + ((j.content || "").length > 200 ? "…" : "");
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#475569").text(d);
        doc.fontSize(9).font("Helvetica").fillColor("#64748b").text(txt, { indent: 10 });
        doc.moveDown(0.3);
      });
    }

    // ── Footer
    const footerY = 780;
    doc.rect(0, footerY, 595, 62).fill("#f8fafc");
    doc.fontSize(8).font("Helvetica").fillColor("#94a3b8")
       .text("Este reporte es generado automáticamente por Zyra IA y no reemplaza el consejo de un profesional de salud mental.", 50, footerY + 10, { align: "center", width: 495 })
       .text("Zyra IA — Aquí estoy, siempre 💙", 50, footerY + 26, { align: "center", width: 495 });

    doc.end();
  } catch(e) {
    console.error("PDF error:", e.message);
    if (!res.headersSent) res.status(500).json({ message: "Error generando el reporte" });
  }
});

module.exports = router;
