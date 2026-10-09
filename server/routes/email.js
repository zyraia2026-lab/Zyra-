// Darse de baja del correo "te extrañamos" desde el enlace del correo (sin iniciar sesión)
const r = require("express").Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const { validUnsubscribe } = require("../utils/unsubscribe");

const page = (title, text) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Zyra</title><meta name="robots" content="noindex"></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0f1a;color:#e8eaf6;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;box-sizing:border-box">
<div style="max-width:420px;text-align:center;background:#141624;border:1px solid #2a2f45;border-radius:20px;padding:32px 26px">
<div style="font-size:44px;margin-bottom:10px">💙</div><h1 style="font-size:20px;margin:0 0 10px">${title}</h1>
<p style="color:#b0b8d8;font-size:14px;line-height:1.6;margin:0 0 22px">${text}</p>
<a href="/" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:12px 24px">Abrir Zyra</a>
</div></body></html>`;

r.get("/unsubscribe", async (req, res) => {
  const { u, t } = req.query;
  if (!u || !mongoose.isValidObjectId(String(u)) || !validUnsubscribe(u, t)) {
    return res.status(400).type("html").send(page("Enlace no válido", "Este enlace no funciona. Si quieres dejar de recibir correos de Zyra, escríbenos a zyra.ia.2026@gmail.com."));
  }
  try {
    await User.updateOne({ _id: u }, { emailOptOut: true });
    res.type("html").send(page("Listo, no te escribiremos más", "Ya no recibirás los correos de recordatorio de Zyra. Tu cuenta sigue igual, y aquí estaremos cuando quieras volver."));
  } catch (e) {
    res.status(500).type("html").send(page("Algo falló", "No pudimos guardar el cambio. Intenta de nuevo en un momento."));
  }
});

module.exports = r;
