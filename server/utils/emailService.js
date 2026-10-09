const { NO_SEND_EMAIL_RE } = require("./testAccounts");

/* ══════════════════════════════════════════════════════════════
   CORREOS DE ZYRA
   Diseño hecho con tablas y estilos en línea: es lo único que Gmail, Outlook y el
   correo del iPhone muestran igual (antes había "display:flex" y en Gmail/Outlook las
   cifras del reporte se veían montadas). Cada correo lleva:
   - texto de vista previa (lo que se ve debajo del asunto en la bandeja),
   - versión en texto plano (ayuda a no caer en Spam),
   - el logo de Zyra en vez de un emoji.
   ══════════════════════════════════════════════════════════════ */

const APP_URL  = process.env.RENDER_EXTERNAL_URL || "https://zyra-app-8qva.onrender.com";
const LOGO_URL = `${APP_URL}/Imagenes/logo-email.png`;
const SUPPORT  = "zyra.ia.2026@gmail.com";

const C = {
  bg: "#f3f1fb", card: "#ffffff", text: "#1f2340", soft: "#5b6178", muted: "#8a8fa6",
  line: "#e9e7f5", brand: "#6d5ef0", brand2: "#8b5cf6", tint: "#f6f4ff",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Para el asunto: es texto plano, así que no se escapa como HTML (antes "Ana & Juan"
// llegaba como "Ana &amp; Juan"); solo se quitan saltos de línea
function plain(str, max = 60) {
  return String(str || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function firstName(name) {
  return plain(name).split(" ")[0] || "";
}
// "1 de octubre": las fechas de la semana se arman a medianoche UTC en el servidor
function fmtDay(d) {
  return new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: "UTC" });
}

/* ── Piezas del diseño ── */
function button(href, label, color = C.brand) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:8px auto 0">
    <tr><td align="center" bgcolor="${color}" style="border-radius:12px;background:${color}">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
    </td></tr></table>`;
}
function heading(icon, title, sub) {
  return `<div style="text-align:center;margin:0 0 22px">
    <div style="font-size:40px;line-height:1;margin:0 0 12px">${icon}</div>
    <h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:${C.text}">${title}</h1>
    ${sub ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.soft}">${sub}</p>` : ""}
  </div>`;
}
function para(html, style = "") {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.soft};${style}">${html}</p>`;
}
function box(inner, { bg = C.tint, border = C.line } = {}) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px">
    <tr><td style="background:${bg};border:1px solid ${border};border-radius:14px;padding:18px 20px;font-family:${FONT};font-size:14px;line-height:1.7;color:${C.soft}">${inner}</td></tr></table>`;
}
// El código va en una sola línea (con espacios entre números, en el celular se partía en dos)
function codeBox(code, label, color) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px">
    <tr><td align="center" style="background:${C.tint};border:2px dashed ${color};border-radius:16px;padding:22px 12px">
      <div style="font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${color};margin:0 0 10px">${label}</div>
      <div style="font-family:'Courier New',Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:8px;white-space:nowrap;color:${C.text};padding-left:8px">${esc(String(code))}</div>
    </td></tr></table>`;
}
// Fila de cifras (en tabla: en Gmail/Outlook "flex" no funciona)
function stats(items) {
  const cells = items.map(s => `<td align="center" valign="top" width="${Math.floor(100 / items.length)}%" style="padding:4px">
      <div style="background:${s.bg};border-radius:12px;padding:14px 6px">
        <div style="font-family:${FONT};font-size:22px;font-weight:800;color:${s.color};line-height:1.2">${s.value}</div>
        <div style="font-family:${FONT};font-size:11px;color:${C.muted};margin-top:4px">${s.label}</div>
      </div></td>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr>${cells}</tr></table>`;
}
function steps(list) {
  return list.map(([icon, title, text]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 10px">
    <tr><td width="44" valign="top" style="font-size:22px;line-height:1;padding-top:2px">${icon}</td>
    <td style="font-family:${FONT};font-size:14px;line-height:1.55;color:${C.soft}"><strong style="color:${C.text}">${title}</strong><br/>${text}</td></tr></table>`).join("");
}
const CRISIS_LINES = `<strong style="color:${C.text}">Línea 106</strong> (apoyo en salud mental) · <strong style="color:${C.text}">123</strong> (emergencias)`;

// HTML que genera la IA para el reporte: solo se dejan etiquetas de texto y sin atributos
// (un enlace o un script colado desde el diario no debe llegar al correo)
function cleanReportHtml(html) {
  const ALLOWED = new Set(["p", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "br"]);
  const STYLE = {
    p: `margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.soft}`,
    h3: `margin:18px 0 8px;font-family:${FONT};font-size:16px;font-weight:800;color:${C.text}`,
    h4: `margin:14px 0 6px;font-family:${FONT};font-size:15px;font-weight:800;color:${C.text}`,
    ul: `margin:0 0 12px;padding-left:20px`, ol: `margin:0 0 12px;padding-left:20px`,
    li: `margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.soft}`,
    strong: `color:${C.text}`, b: `color:${C.text}`,
  };
  return String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (m, close, tag) => {
      tag = tag.toLowerCase();
      if (!ALLOWED.has(tag)) return "";
      if (close || tag === "br") return close ? `</${tag}>` : "<br/>";
      return STYLE[tag] ? `<${tag} style="${STYLE[tag]}">` : `<${tag}>`;
    });
}

// Versión en texto plano del correo (la piden los filtros de Spam y la leen algunos relojes)
function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => `${txt.replace(/<[^>]+>/g, "").trim()} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|h4|li|tr|div|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#8204;/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n").map(l => l.trim()).join("\n").trim();
}

// preheader: el texto que se ve en la bandeja debajo del asunto
// note: línea pequeña antes del pie (por qué te llega el correo, darse de baja…)
function layout({ preheader = "", body, note = "" }) {
  const filler = "&#8204;&nbsp;".repeat(60);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/><title>Zyra</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(preheader)}${filler}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
      <tr><td align="center" bgcolor="${C.brand}" style="background:${C.brand};background-image:linear-gradient(135deg,#7c5cfc 0%,#6d5ef0 50%,#4a9eff 100%);border-radius:20px 20px 0 0;padding:26px 24px">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
          <td valign="middle" style="padding-right:12px"><img src="${LOGO_URL}" width="44" height="44" alt="Zyra" style="display:block;border:0;border-radius:12px;background:#ffffff"/></td>
          <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-.3px">Zyra</td>
        </tr></table>
        <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:rgba(255,255,255,.88);margin-top:10px">Tu amiga para el bienestar emocional</div>
      </td></tr>
      <tr><td bgcolor="${C.card}" style="background:${C.card};padding:34px 30px 28px;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">${body}</td></tr>
      <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-top:1px solid ${C.line};border-radius:0 0 20px 20px;padding:20px 30px 24px;text-align:center">
        ${note ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">${note}</p>` : ""}
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.muted}">
          <a href="mailto:${SUPPORT}" style="color:${C.brand};text-decoration:none;font-weight:600">Escríbenos</a>
          &nbsp;·&nbsp;<a href="${APP_URL}/legal" style="color:${C.brand};text-decoration:none;font-weight:600">Términos y privacidad</a>
        </p>
        <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;color:#b0b3c4">© 2026 Zyra · Hecho con 💜 en Colombia</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// replyTo (opcional): a quién le llega la respuesta cuando el destinatario da "Responder"
// headers (opcional): por ejemplo List-Unsubscribe en los correos de recordatorio
async function sendBrevoEmail({ to, subject, html, replyTo, text, headers }) {
  if (NO_SEND_EMAIL_RE.test(String(to || ""))) {
    console.log("[email] omitido: dominio de prueba que no recibe correo");
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Zyra", email: process.env.EMAIL_USER },
      to: [{ email: to }],
      ...(replyTo ? { replyTo } : {}),
      ...(headers ? { headers } : {}),
      subject,
      htmlContent: html,
      textContent: text || htmlToText(html),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API ${res.status}: ${err}`);
  }
}

/* ══ Código para crear la cuenta o iniciar sesión ══ */
const sendVerificationCode = async (toEmail, code, userName = "") => {
  const name = esc(firstName(userName));
  await sendBrevoEmail({
    to: toEmail,
    subject: `${code} es tu código de Zyra`,
    html: layout({
      preheader: "Úsalo en los próximos 10 minutos. Si no fuiste tú, ignora este correo.",
      body: heading("🔐", "Confirma que eres tú", `${name ? `Hola, ${name}. ` : ""}Escribe este código en Zyra para continuar:`)
        + codeBox(code, "Tu código", C.brand)
        + para(`⏱ Vence en <strong style="color:${C.text}">10 minutos</strong>. Si no pediste este código, ignora este correo: nadie puede entrar sin él.`, "text-align:center;font-size:14px")
        + para(`¿No te llegó a la bandeja principal? Búscalo en "Promociones" o en Spam, y márcalo como "No es spam" para que los próximos lleguen bien.`, `text-align:center;font-size:12.5px;color:${C.muted};margin:0`),
    }),
  });
};

/* ══ Bienvenida (al crear la cuenta) ══ */
const sendWelcomeEmail = async (toEmail, userName = "") => {
  try {
    const first = firstName(userName);
    const name = esc(first);
    await sendBrevoEmail({
      to: toEmail,
      subject: first ? `${first}, te damos la bienvenida a Zyra 💜` : "Te damos la bienvenida a Zyra 💜",
      html: layout({
        preheader: "Tu cuenta está lista. Tres cosas cortas para empezar hoy.",
        body: heading("💜", name ? `¡Hola, ${name}! Qué bueno tenerte aquí` : "¡Qué bueno tenerte aquí!", "Zyra es tu amiga para los días buenos y los difíciles: te escucha, te recuerda y te ayuda a sentirte mejor.")
          + `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">Para empezar hoy</p>`
          + steps([
            ["💬", "Cuéntale cómo estás", "Sin filtro y sin juicios. Zyra recuerda lo que le cuentas para acompañarte mejor."],
            ["💓", "Haz tu check-in de 30 segundos", "Tu pulso (con el reloj o la cámara) y cómo te sientes. Así ves tu semana."],
            ["🌬️", "Respira un minuto", "Una respiración guiada para bajar las revoluciones cuando lo necesites."],
          ])
          + `<div style="height:8px"></div>`
          + box(`<strong style="color:${C.text}">Con el plan Gratis tienes:</strong> 15 mensajes al día con Zyra, diario ilimitado, hasta 3 metas, respiración, meditación, juegos y música.`)
          + `<div style="text-align:center;margin:0 0 22px">${button(APP_URL, "Abrir Zyra")}</div>`
          + box(`💙 Zyra te acompaña, pero no reemplaza a un profesional de la salud mental. Si en algún momento sientes que no puedes más, busca ayuda ya: ${CRISIS_LINES}.`, { bg: "#fbf9ff", border: C.line }),
      }),
    });
  } catch(e) {
    console.error("Welcome email error:", e.message);
  }
};

/* ══ Código para cambiar la contraseña ══ */
const sendPasswordResetCode = async (toEmail, code, userName = "") => {
  const name = esc(firstName(userName));
  await sendBrevoEmail({
    to: toEmail,
    subject: `${code} es tu código para cambiar la contraseña de Zyra`,
    html: layout({
      preheader: "Vence en 10 minutos. Si no lo pediste, tu contraseña sigue igual.",
      body: heading("🔑", "Cambia tu contraseña", `${name ? `Hola, ${name}. ` : ""}Recibimos una solicitud para cambiar la contraseña de tu cuenta. Usa este código:`)
        + codeBox(code, "Tu código", "#e0567a")
        + para(`⏱ Vence en <strong style="color:${C.text}">10 minutos</strong>. Si no lo pediste, ignora este correo: tu contraseña sigue igual y tu cuenta está segura.`, "text-align:center;font-size:14px;margin:0"),
    }),
  });
};

/* ══ Reporte semanal (planes pagos) ══ */
const EMOTION_EMOJI = { feliz:"😊", tranquilo:"😌", ansioso:"😰", triste:"😢", enojado:"😤", confundido:"🤔", esperanzado:"🌟", agotado:"😮‍💨", motivado:"💪", nostalgico:"🌅" };
const EMOTION_NOUN = { feliz:"felicidad", tranquilo:"calma", ansioso:"ansiedad", triste:"tristeza", enojado:"enojo", confundido:"confusión", esperanzado:"esperanza", agotado:"agotamiento", motivado:"motivación", nostalgico:"nostalgia" };

const sendWeeklyReport = async (toEmail, userName, html, data) => {
  const topEmoji = EMOTION_EMOJI[data.topEmotion] || "💙";
  const name = esc(firstName(userName));
  const range = `${fmtDay(data.weekStart)} al ${fmtDay(new Date(new Date(data.weekEnd) - 1))}`;
  const heart = data.heart;
  const cells = [
    { value: `${data.positivity}%`, label: "Ánimo positivo", color: C.brand, bg: C.tint },
    { value: String(data.history.length), label: "Registros", color: "#0f9f76", bg: "#effaf5" },
    { value: String(data.completedGoals.length), label: "Metas logradas", color: "#c27c0e", bg: "#fff8ec" },
  ];
  if (heart && heart.restAvg != null) cells.push({ value: `${heart.restAvg}`, label: "Pulso en reposo", color: "#d6336c", bg: "#fff1f5" });
  const heartLine = heart && heart.goal
    ? box(`🎯 <strong style="color:${C.text}">Meta de esta semana:</strong> ${esc(heart.goal.text)}`, { bg: "#fff6f9", border: "#f6d9e4" })
    : "";
  await sendBrevoEmail({
    to: toEmail,
    subject: `Tu semana en Zyra ${topEmoji} · ${range}`,
    html: layout({
      preheader: `Tu emoción más frecuente fue ${EMOTION_NOUN[data.topEmotion] || "la calma"}. Mira lo que notó Zyra y tu plan para esta semana.`,
      body: heading(topEmoji, name ? `${name}, así fue tu semana` : "Así fue tu semana", `Del ${range}`)
        + stats(cells)
        + `<div style="border-top:1px solid ${C.line};padding-top:16px;margin:0 0 6px">${cleanReportHtml(html)}</div>`
        + heartLine
        + `<div style="text-align:center;margin:6px 0 0">${button(`${APP_URL}/?p=weekly-report`, "Ver mi reporte en Zyra")}</div>`,
      note: "Te llega porque tu plan incluye el reporte semanal. Este análisis lo hace la IA de Zyra con lo que registraste; no es un diagnóstico.",
    }),
  });
};

/* ══ Reporte compartido con alguien de confianza (psicólogo, familiar…) ══ */
const sendSharedWeeklyReport = async (toEmail, recipientName, userName, report) => {
  const POSITIVE = new Set(["feliz","tranquilo","esperanzado","motivado"]);
  const freq = report.emotionData || {};
  const total = Object.values(freq).reduce((s, n) => s + n, 0);
  const positive = Object.entries(freq).reduce((s, [e, n]) => s + (POSITIVE.has(e) ? n : 0), 0);
  const positivity = total > 0 ? Math.round((positive / total) * 100) : 0;
  const topEmoji = EMOTION_EMOJI[report.mainEmotion] || "💙";
  const weekStart = new Date(report.weekOf);
  const range = `${fmtDay(weekStart)} al ${fmtDay(new Date(weekStart.getTime() + 6 * 86400000))}`;
  const who = esc(plain(userName, 80));
  // Nombre completo: a un tercero ("Dra. Martínez") no se le saluda solo por la primera palabra
  const to = esc(plain(recipientName, 40).replace(/[.\s]+$/, ""));
  const cells = [
    { value: `${positivity}%`, label: "Ánimo positivo", color: C.brand, bg: C.tint },
    { value: String(total), label: "Registros", color: "#0f9f76", bg: "#effaf5" },
  ];
  if (report.heart && report.heart.restAvg != null) cells.push({ value: `${report.heart.restAvg}`, label: "Pulso en reposo", color: "#d6336c", bg: "#fff1f5" });
  await sendBrevoEmail({
    to: toEmail,
    subject: `${plain(userName, 40)} compartió contigo su reporte de bienestar ${topEmoji}`,
    html: layout({
      preheader: `Semana del ${range}. ${plain(userName, 40)} quiso que lo vieras.`,
      body: heading(topEmoji, `${to ? `Hola, ${to}. ` : ""}${who} quiso compartir esto contigo`, `Su semana en Zyra, del ${range}`)
        + stats(cells)
        + `<div style="border-top:1px solid ${C.line};padding-top:16px;margin:0 0 6px">${cleanReportHtml(report.html)}</div>`
        + box(`Este resumen lo hizo la IA de Zyra con lo que ${who} registró en la app. Puede servir para empezar una conversación, pero no reemplaza una evaluación profesional.`),
      note: `Te llega porque ${who} escribió tu correo para compartirte este reporte. No te suscribimos a nada.`,
    }),
  });
};

/* ══ Alerta de crisis al contacto de emergencia ══ */
const sendCrisisAlert = async (toEmail, contactName, userName, message) => {
  try {
    const who = esc(plain(userName, 80));
    const to = esc(firstName(contactName));
    await sendBrevoEmail({
      to: toEmail,
      subject: `${plain(userName, 40)} podría necesitar tu apoyo hoy`,
      html: layout({
        preheader: `${plain(userName, 40)} te eligió como su persona de confianza en Zyra.`,
        body: heading("🤝", `${to ? `Hola, ${to}` : "Hola"}`, `<strong style="color:${C.text}">${who}</strong> te registró en Zyra como su contacto de confianza. Por lo que escribió hace poco, creemos que podría estar pasando por un momento muy difícil.`)
          + `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">Lo que puedes hacer</p>`
          + steps([
            ["📞", "Búscale hoy", "Una llamada o un mensaje sencillo: «Pensé en ti, ¿cómo estás?». No necesitas tener las palabras perfectas."],
            ["👂", "Escucha sin juzgar", "Pregúntale cómo se siente y deja que hable. Estar presente ya ayuda mucho."],
            ["🚨", "Si hay peligro inmediato", "Llama al 123 o acompáñale a urgencias. No le dejes sin compañía."],
          ])
          + box(`Líneas de ayuda en Colombia: ${CRISIS_LINES}. En otro país: <a href="https://findahelpline.com" style="color:${C.brand}">findahelpline.com</a>`, { bg: "#fff6f6", border: "#f7d6d6" }),
        note: `Por privacidad, no incluimos lo que ${who} escribió. Te llega solo porque te eligió como su contacto de emergencia.`,
      }),
    });
  } catch(e) {
    console.error("Crisis alert email error:", e.message);
  }
};

/* ══ Apoyo a la propia persona cuando escribió algo de crisis ══
   (antes recibía la alerta del contacto de emergencia: "Hola Ana, Ana te registró como
   contacto de emergencia…") */
const sendCrisisSupportEmail = async (toEmail, userName = "") => {
  try {
    const name = esc(firstName(userName));
    await sendBrevoEmail({
      to: toEmail,
      subject: "Aquí estamos contigo 💙",
      html: layout({
        preheader: "Hay personas listas para escucharte ahora mismo, sin juzgarte.",
        body: heading("💙", name ? `${name}, aquí estamos contigo` : "Aquí estamos contigo", "Lo que escribiste nos importa. Si estás pasando por un momento muy difícil, no tienes que cargarlo en silencio.")
          + box(`<strong style="color:${C.text};font-size:15px">Habla con alguien ahora</strong><br/>📞 ${CRISIS_LINES}<br/>Te atienden personas preparadas para escucharte, sin juzgarte.`, { bg: "#fff6f6", border: "#f7d6d6" })
          + steps([
            ["🤝", "Busca a alguien de confianza", "Un amigo, alguien de tu familia o tu persona de confianza. Un mensaje corto basta: «No estoy bien, ¿hablamos?»."],
            ["🛟", "Abre tu plan de seguridad", "Las señales, lo que te ayuda y las personas a las que puedes llamar, en un solo lugar."],
          ])
          + `<div style="text-align:center;margin:8px 0 0">${button(`${APP_URL}/?p=profile`, "Abrir mi plan de seguridad")}</div>`,
        note: "Zyra te acompaña, pero no reemplaza a un profesional de la salud mental. Si estás en peligro, llama al 123.",
      }),
    });
  } catch(e) {
    console.error("Crisis support email error:", e.message);
  }
};

/* ══ "Te extrañamos": a quien lleva varios días sin entrar (cron en server/index.js) ══
   opts.days: días sin entrar · opts.userId: para el enlace de "no recibir más estos correos" */
const sendNudgeEmail = async (toEmail, userName = "", opts = {}) => {
  try {
    const first = firstName(userName);
    const name = esc(first);
    const days = Number(opts.days) || 0;
    const { unsubscribeUrl } = require("./unsubscribe");
    const unsub = opts.userId ? unsubscribeUrl(opts.userId) : null;
    await sendBrevoEmail({
      to: toEmail,
      subject: first ? `${first}, te extrañamos 💙` : "Te extrañamos 💙",
      // Gmail y Outlook muestran "Cancelar suscripción" junto al remitente con esto
      headers: unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
      html: layout({
        preheader: "No tienes que estar mal para volver. Algo de 30 segundos para hoy.",
        body: heading("💙", name ? `Hola, ${name}` : "Hola", `${days >= 2 ? `Hace ${days} días que no hablamos.` : "Hace unos días que no hablamos."} No tienes que estar mal para volver: ¿cómo vas hoy?`)
          + `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">Algo cortico para hoy</p>`
          + steps([
            ["💓", "Tu check-in cuerpo y mente", "30 segundos: tu pulso y cómo te sientes."],
            ["💬", "Cuéntale a Zyra cómo te fue", "Te escucha sin juzgar y se acuerda de lo que le cuentas."],
            ["🌬️", "Una respiración guiada", "Un minuto para bajar las revoluciones."],
          ])
          + `<div style="text-align:center;margin:10px 0 0">${button(APP_URL, "Volver a Zyra")}</div>`,
        note: `Te escribimos porque tienes una cuenta en Zyra.${unsub ? ` <a href="${unsub}" style="color:${C.muted};text-decoration:underline">No quiero recibir más estos correos</a>` : ""}`,
      }),
    });
  } catch(e) {
    console.error("Nudge email error:", e.message);
  }
};

module.exports = {
  sendVerificationCode, sendWelcomeEmail, sendPasswordResetCode, sendWeeklyReport, sendSharedWeeklyReport,
  sendCrisisAlert, sendCrisisSupportEmail, sendNudgeEmail, sendBrevoEmail,
  // Para las pruebas y para ver los correos sin enviarlos
  _layout: layout, _cleanReportHtml: cleanReportHtml, _htmlToText: htmlToText,
};
