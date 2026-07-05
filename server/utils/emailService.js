const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const BRAND_HEADER = `
  <div style="background:linear-gradient(135deg,#7c5cfc,#4a9eff);padding:32px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;letter-spacing:-1px;">🌊 Zyra</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Bienestar Emocional con IA</p>
  </div>`;

const BRAND_FOOTER = `
  <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
    <p style="color:#3a3a5a;font-size:12px;margin:0;">© 2026 Zyra — Bienestar Emocional</p>
    <p style="color:#3a3a5a;font-size:11px;margin:6px 0 0;">
      <a href="mailto:zyra.ia.2026@gmail.com" style="color:#5a5a8a;text-decoration:none;">zyra.ia.2026@gmail.com</a> ·
      <a href="https://zyra-app.onrender.com/legal" style="color:#5a5a8a;text-decoration:none;">Términos y Privacidad</a>
    </p>
  </div>`;

function wrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
  <body style="margin:0;padding:0;background:#09090f;font-family:'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:40px auto;background:#12121e;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
      ${BRAND_HEADER}
      <div style="padding:36px 32px;">${body}</div>
      ${BRAND_FOOTER}
    </div>
  </body></html>`;
}

const sendVerificationCode = async (toEmail, code, userName = "") => {
  const nameHtml = userName ? ` <strong style="color:#f0f0ff">${userName}</strong>` : "";
  await transporter.sendMail({
    from: `"Zyra 🌊" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Tu código de verificación — Zyra",
    html: wrap(`
      <p style="color:#a8a8c8;font-size:15px;margin:0 0 8px;text-align:center;">Hola${nameHtml}, tu código de verificación es:</p>
      <div style="background:rgba(124,92,252,0.1);border:2px solid rgba(124,92,252,0.4);border-radius:16px;padding:24px;margin:24px 0;text-align:center;">
        <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#f0f0ff;">${code}</span>
      </div>
      <p style="color:#5a5a7a;font-size:13px;margin:0;text-align:center;">Este código expira en <strong style="color:#a8a8c8;">10 minutos</strong>.</p>
      <p style="color:#5a5a7a;font-size:13px;margin:8px 0 0;text-align:center;">Si no solicitaste este código, ignora este mensaje.</p>
    `),
  });
};

const sendWelcomeEmail = async (toEmail, userName = "") => {
  try {
    await transporter.sendMail({
      from: `"Zyra 🌊" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Bienvenida a Zyra — Tu viaje de bienestar comienza hoy",
      html: wrap(`
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;margin-bottom:8px;">🌊</div>
          <h2 style="color:#f0f0ff;margin:0;font-size:22px;">¡Hola, ${userName}!</h2>
          <p style="color:#a8a8c8;font-size:15px;margin:12px 0 0;">Tu cuenta en Zyra está lista. Estamos aquí para acompañarte.</p>
        </div>
        <div style="background:rgba(99,102,241,0.08);border-radius:14px;padding:20px;margin-bottom:20px;">
          <p style="color:#c8c8e8;font-size:13px;margin:0 0 12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Con tu plan Gratis puedes:</p>
          <div style="color:#a8a8c8;font-size:13px;line-height:2;">
            💬 20 mensajes diarios con Zyra IA<br/>
            📔 Hasta 5 entradas en tu diario<br/>
            🎯 Hasta 3 metas activas<br/>
            🧘 Ejercicios de meditación y respiración<br/>
            🎵 Música para el bienestar
          </div>
        </div>
        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="color:#f87171;font-size:12px;margin:0;line-height:1.6;">
            <strong>Aviso importante:</strong> Zyra es una herramienta de apoyo emocional y NO reemplaza la atención de un profesional de salud mental. Si estás atravesando una crisis, por favor contacta a un especialista o línea de ayuda en tu país.
          </p>
        </div>
        <div style="text-align:center;">
          <a href="https://zyra-app.onrender.com" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Abrir Zyra →</a>
        </div>
      `),
    });
  } catch(e) {
    console.error("Welcome email error:", e.message);
  }
};

const sendPasswordResetCode = async (toEmail, code, userName = "") => {
  const nameHtml = userName ? ` <strong style="color:#f0f0ff">${userName}</strong>` : "";
  await transporter.sendMail({
    from: `"Zyra 🌊" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Restablecer contraseña — Zyra",
    html: wrap(`
      <p style="color:#a8a8c8;font-size:15px;margin:0 0 8px;text-align:center;">Hola${nameHtml}, recibimos una solicitud para restablecer tu contraseña.</p>
      <div style="background:rgba(239,68,68,0.1);border:2px solid rgba(239,68,68,0.3);border-radius:16px;padding:24px;margin:24px 0;text-align:center;">
        <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#f0f0ff;">${code}</span>
      </div>
      <p style="color:#5a5a7a;font-size:13px;margin:0;text-align:center;">Este código expira en <strong style="color:#a8a8c8;">10 minutos</strong>.</p>
      <p style="color:#5a5a7a;font-size:13px;margin:8px 0 0;text-align:center;">Si no solicitaste este cambio, ignora este mensaje y tu contraseña seguirá siendo la misma.</p>
    `),
  });
};

module.exports = { sendVerificationCode, sendWelcomeEmail, sendPasswordResetCode };
