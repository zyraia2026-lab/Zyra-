function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND_HEADER = `
  <div style="background:linear-gradient(135deg,#7c5cfc 0%,#6d5ef0 45%,#4a9eff 100%);padding:38px 32px 32px;text-align:center;">
    <div style="display:inline-block;width:52px;height:52px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.25);border-radius:16px;line-height:52px;font-size:24px;margin-bottom:14px;">🌊</div>
    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.3px;font-family:Georgia,'Times New Roman',serif;">Zyra</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:11.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Bienestar emocional con IA</p>
  </div>`;

const BRAND_FOOTER = `
  <div style="padding:24px 32px 30px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
    <p style="color:#4a4a6a;font-size:11.5px;margin:0 0 10px;line-height:1.6;">Este es un mensaje automático — no hace falta que respondas.</p>
    <p style="color:#5a5a8a;font-size:11.5px;margin:0;">
      <a href="mailto:zyra.ia.2026@gmail.com" style="color:#9b9bd8;text-decoration:none;font-weight:600;">Soporte</a>
      <span style="color:#2a2a40;margin:0 8px;">·</span>
      <a href="https://zyra-app-8qva.onrender.com/legal" style="color:#9b9bd8;text-decoration:none;font-weight:600;">Términos y Privacidad</a>
    </p>
    <p style="color:#33334d;font-size:10.5px;margin:16px 0 0;letter-spacing:.2px;">© 2026 Zyra — Hecho con 💜 para Latinoamérica</p>
  </div>`;

function wrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background:#050508;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:32px auto;padding:0 16px;">
      <div style="background:#12121e;border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 60px rgba(0,0,0,0.45);">
        ${BRAND_HEADER}
        <div style="padding:34px 32px;">${body}</div>
        ${BRAND_FOOTER}
      </div>
    </div>
  </body></html>`;
}

async function sendBrevoEmail({ to, subject, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Zyra 🌊", email: process.env.EMAIL_USER },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API ${res.status}: ${err}`);
  }
}

const sendVerificationCode = async (toEmail, code, userName = "") => {
  const nameHtml = userName ? ` <strong style="color:#f0f0ff">${esc(userName)}</strong>` : "";
  const codeSpaced = String(code).split("").join(" ");
  await sendBrevoEmail({
    to: toEmail,
    subject: `${code} es tu código de verificación — Zyra`,
    html: wrap(`
      <div style="text-align:center;margin:0 0 4px;">
        <span style="display:inline-block;width:40px;height:40px;background:rgba(124,92,252,0.14);border-radius:12px;line-height:40px;font-size:19px;">🔐</span>
      </div>
      <h2 style="color:#f0f0ff;font-size:19px;font-weight:800;text-align:center;margin:16px 0 6px;letter-spacing:-.2px;">Confirma que eres tú</h2>
      <p style="color:#8a8ab0;font-size:14px;margin:0 0 26px;text-align:center;line-height:1.6;">Hola${nameHtml}, usa este código para continuar:</p>
      <div style="background:linear-gradient(160deg,rgba(124,92,252,0.16),rgba(74,158,255,0.08));border:1.5px solid rgba(124,92,252,0.4);border-radius:18px;padding:26px 20px;margin:0 0 24px;text-align:center;">
        <p style="color:#8b8bc4;font-size:10.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">Tu código de verificación</p>
        <div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#ffffff;font-family:'Courier New',Consolas,monospace;">${codeSpaced}</div>
      </div>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:13px 16px;text-align:center;">
            <span style="color:#7a7a9a;font-size:12.5px;">⏱ Expira en <strong style="color:#c0c0e0;">10 minutos</strong> · Si no fuiste tú, ignora este correo</span>
          </td>
        </tr>
      </table>
    `),
  });
};

const sendWelcomeEmail = async (toEmail, userName = "") => {
  try {
    await sendBrevoEmail({
      to: toEmail,
      subject: `Hola, ${esc(userName)} — Zyra ya está lista para ti`,
      html: wrap(`
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;margin-bottom:8px;">🌊</div>
          <h2 style="color:#f0f0ff;margin:0;font-size:22px;">Hola, ${esc(userName)}</h2>
          <p style="color:#a8a8c8;font-size:15px;margin:12px 0 0;">Tu cuenta ya está lista. Cuando quieras hablar, aquí estoy.</p>
        </div>
        <div style="background:rgba(99,102,241,0.08);border-radius:14px;padding:20px;margin-bottom:20px;">
          <p style="color:#c8c8e8;font-size:13px;margin:0 0 12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Con tu plan Gratis puedes:</p>
          <div style="color:#a8a8c8;font-size:13px;line-height:2;">
            💬 15 mensajes diarios con Zyra IA<br/>
            📔 Hasta 10 entradas en tu diario<br/>
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
          <a href="https://zyra-app-8qva.onrender.com" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Abrir Zyra →</a>
        </div>
      `),
    });
  } catch(e) {
    console.error("Welcome email error:", e.message);
  }
};

const sendPasswordResetCode = async (toEmail, code, userName = "") => {
  const nameHtml = userName ? ` <strong style="color:#f0f0ff">${esc(userName)}</strong>` : "";
  const codeSpaced = String(code).split("").join(" ");
  await sendBrevoEmail({
    to: toEmail,
    subject: `${code} — Restablecer tu contraseña de Zyra`,
    html: wrap(`
      <div style="text-align:center;margin:0 0 4px;">
        <span style="display:inline-block;width:40px;height:40px;background:rgba(239,68,68,0.14);border-radius:12px;line-height:40px;font-size:19px;">🔑</span>
      </div>
      <h2 style="color:#f0f0ff;font-size:19px;font-weight:800;text-align:center;margin:16px 0 6px;letter-spacing:-.2px;">Restablecer contraseña</h2>
      <p style="color:#8a8ab0;font-size:14px;margin:0 0 26px;text-align:center;line-height:1.6;">Hola${nameHtml}, recibimos una solicitud para cambiar tu contraseña. Usa este código:</p>
      <div style="background:linear-gradient(160deg,rgba(239,68,68,0.14),rgba(239,68,68,0.05));border:1.5px solid rgba(239,68,68,0.35);border-radius:18px;padding:26px 20px;margin:0 0 24px;text-align:center;">
        <p style="color:#f0a0a0;font-size:10.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">Código de restablecimiento</p>
        <div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#ffffff;font-family:'Courier New',Consolas,monospace;">${codeSpaced}</div>
      </div>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:13px 16px;text-align:center;">
            <span style="color:#7a7a9a;font-size:12.5px;">⏱ Expira en <strong style="color:#c0c0e0;">10 minutos</strong> · Si no fuiste tú, tu contraseña sigue igual</span>
          </td>
        </tr>
      </table>
    `),
  });
};

const sendWeeklyReport = async (toEmail, userName, html, data) => {
  const EMOTION_EMOJI = { feliz:"😊", tranquilo:"😌", ansioso:"😰", triste:"😢", enojado:"😤", confundido:"🤔", esperanzado:"🌟", agotado:"😮‍💨", motivado:"💪", nostalgico:"🌅" };
  const topEmoji = EMOTION_EMOJI[data.topEmotion] || "💙";
  await sendBrevoEmail({
    to: toEmail,
    subject: `Tu reporte semanal Zyra ${topEmoji} — ${new Date(data.weekStart).toLocaleDateString("es-CO")}`,
    html: wrap(`
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:40px;margin-bottom:8px;">${topEmoji}</div>
        <h2 style="color:#f0f0ff;margin:0;font-size:20px;">Reporte de la semana, ${esc(userName)}</h2>
        <p style="color:#7a7a9a;font-size:13px;margin:8px 0 0;">
          ${new Date(data.weekStart).toLocaleDateString("es-CO")} – ${new Date(data.weekEnd).toLocaleDateString("es-CO")}
        </p>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div style="flex:1;min-width:110px;background:rgba(99,102,241,.1);border-radius:12px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#818cf8">${data.positivity}%</div>
          <div style="font-size:11px;color:#7a7a9a;margin-top:4px">Positividad</div>
        </div>
        <div style="flex:1;min-width:110px;background:rgba(16,185,129,.1);border-radius:12px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#34d399">${data.history.length}</div>
          <div style="font-size:11px;color:#7a7a9a;margin-top:4px">Registros</div>
        </div>
        <div style="flex:1;min-width:110px;background:rgba(251,191,36,.1);border-radius:12px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#fbbf24">${data.completedGoals.length}</div>
          <div style="font-size:11px;color:#7a7a9a;margin-top:4px">Metas logradas</div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:20px;margin-bottom:20px;color:#c8c8e8;font-size:14px;line-height:1.8">
        ${html}
      </div>
      <div style="text-align:center;margin-top:20px">
        <a href="https://zyra-app-8qva.onrender.com" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">Ver mi progreso en Zyra →</a>
      </div>
    `),
  });
};

const sendCrisisAlert = async (toEmail, contactName, userName, message) => {
  try {
    await sendBrevoEmail({
      to: toEmail,
      subject: `⚠️ Alerta de bienestar — ${userName} podría necesitar apoyo`,
      html: wrap(`
        <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:16px;padding:24px;margin-bottom:20px">
          <h2 style="color:#f87171;margin:0 0 8px;font-size:18px">⚠️ Alerta de bienestar emocional</h2>
          <p style="color:#fca5a5;font-size:13px;margin:0">Zyra ha detectado que <strong>${esc(userName)}</strong> podría estar pasando por un momento difícil.</p>
        </div>
        <p style="color:#c8c8e8;font-size:14px;line-height:1.7">Hola ${esc(contactName)},</p>
        <p style="color:#a8a8c8;font-size:14px;line-height:1.7">${esc(userName)} te registró como contacto de emergencia en Zyra. Hemos detectado una posible situación de crisis y te notificamos para que puedas estar disponible si te necesita.</p>
        <p style="color:#a8a8c8;font-size:14px;line-height:1.7">Por favor intenta ponerte en contacto con ${esc(userName)} pronto. Si crees que está en peligro inmediato, contacta los servicios de emergencia.</p>
        <div style="background:rgba(99,102,241,.08);border-radius:12px;padding:16px;margin:20px 0">
          <p style="color:#818cf8;font-size:13px;margin:0;font-weight:700">Líneas de crisis:</p>
          <p style="color:#a8a8c8;font-size:13px;margin:8px 0 0;line-height:1.8">🇨🇴 Colombia: Línea 106 (Salud Mental) · 123 (Emergencias)<br/>🇪🇸 España: 024 (Suicidio) · 112 (Emergencias)<br/>🌎 Internacional: befrienders.org</p>
        </div>
        <p style="color:#5a5a7a;font-size:12px">Este mensaje fue enviado automáticamente por Zyra como parte de su sistema de apoyo a usuarios.</p>
      `),
    });
  } catch(e) {
    console.error("Crisis alert email error:", e.message);
  }
};

const sendNudgeEmail = async (toEmail, userName = "") => {
  try {
    await sendBrevoEmail({
      to: toEmail,
      subject: `${esc(userName)}, ¿cómo estás? 🌊`,
      html: wrap(`
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;margin-bottom:8px;">💙</div>
          <h2 style="color:#f0f0ff;margin:0;font-size:20px;">Ei, ${esc(userName)}</h2>
          <p style="color:#a8a8c8;font-size:15px;margin:12px 0 0;">Han pasado unos días desde que llegaste a Zyra.<br/>¿Cómo estás hoy?</p>
        </div>
        <div style="background:rgba(99,102,241,0.08);border-radius:14px;padding:20px;margin-bottom:20px;">
          <p style="color:#c8c8e8;font-size:13px;margin:0 0 12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Cosas que puedes hacer ahora:</p>
          <div style="color:#a8a8c8;font-size:13px;line-height:2.2;">
            💬 <strong style="color:#c8c8e8;">Hablar con Zyra</strong> — está aquí, siempre lista<br/>
            📔 <strong style="color:#c8c8e8;">Escribir en tu diario</strong> — liberar lo que cargás<br/>
            🎯 <strong style="color:#c8c8e8;">Crear una meta</strong> — un paso pequeño importa<br/>
            🧘 <strong style="color:#c8c8e8;">Hacer un ejercicio de respiración</strong>
          </div>
        </div>
        <p style="color:#7a7a9a;font-size:13px;line-height:1.7;margin-bottom:24px;">No tienes que estar mal para hablar. A veces solo necesitás un espacio donde alguien te escuche.</p>
        <div style="text-align:center;">
          <a href="https://zyra-app-8qva.onrender.com" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Abrir Zyra ahora →</a>
        </div>
        <p style="color:#3a3a5a;font-size:11px;text-align:center;margin-top:24px;">Si no quieres recibir estos mensajes, puedes eliminar tu cuenta desde la app en Configuración → Privacidad.</p>
      `),
    });
  } catch(e) {
    console.error("Nudge email error:", e.message);
  }
};

module.exports = { sendVerificationCode, sendWelcomeEmail, sendPasswordResetCode, sendWeeklyReport, sendCrisisAlert, sendNudgeEmail };
