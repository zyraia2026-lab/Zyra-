const express = require("express");
const { rateLimit } = require("express-rate-limit");
const ContactLead = require("../models/ContactLead");
const { sendBrevoEmail } = require("../utils/emailService");

const r = express.Router();

const TEAM_EMAIL = "zyra.ia.2026@gmail.com";
const SIZES = ["5-25", "26-100", "101-500", "500+"];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// Máximo 5 solicitudes por hora y por IP: evita que el formulario se use para spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados envíos desde tu conexión. Intenta más tarde." },
});

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (v, n) => String(v || "").trim().slice(0, n);

// POST /api/contact — formulario B2B (público, sin login)
r.post("/", contactLimiter, async (req, res) => {
  const body = req.body || {};

  // Campo trampa: las personas no lo ven; los bots suelen llenarlo. No se descarta:
  // se guarda marcado como spam (sin aviso por correo) por si el autocompletado del
  // navegador lo llenó en un contacto real.
  const spam = !!body.website;

  const name    = clip(body.name, 100);
  const company = clip(body.company, 150);
  const email   = clip(body.email, 254);
  const size    = clip(body.size, 10);
  const message = clip(body.message, 2000);

  if (!name) return res.status(400).json({ message: "Escribe tu nombre." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: "El correo no es válido." });
  if (size && !SIZES.includes(size)) return res.status(400).json({ message: "Tamaño de equipo no válido." });

  try {
    await ContactLead.create({ name, company, email, size, message, spam });
  } catch (e) {
    console.error("[contact] no se pudo guardar:", e.message);
    return res.status(500).json({ message: "No pudimos recibir tu mensaje. Escríbenos a zyra.ia.2026@gmail.com" });
  }
  if (spam) return res.json({ success: true });

  // El aviso al equipo es best-effort: la solicitud ya quedó guardada
  sendBrevoEmail({
    to: TEAM_EMAIL,
    replyTo: { email, name }, // "Responder" le escribe directo a quien llenó el formulario
    subject: `Contacto B2B — ${company || name}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      <p><b>Nombre:</b> ${esc(name)}</p>
      <p><b>Empresa:</b> ${esc(company || "No especificada")}</p>
      <p><b>Correo:</b> ${esc(email)}</p>
      <p><b>Tamaño del equipo:</b> ${esc(size || "No especificado")}</p>
      <p><b>Mensaje:</b><br>${esc(message || "Sin mensaje").replace(/\n/g, "<br>")}</p>
    </div>`,
  }).catch(e => console.error("[contact] aviso por correo fallido:", e.message));

  res.json({ success: true });
});

module.exports = r;
