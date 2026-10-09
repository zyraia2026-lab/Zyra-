// Pruebas de los correos (server/utils/emailService.js), sin enviar nada: se intercepta la
// llamada a Brevo y se revisa lo que se iba a mandar.   npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
process.env.BREVO_API_KEY = "prueba";
process.env.EMAIL_USER = "zyra@example.org";
process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba";

const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, text: async () => "" }; };
const E = require("../utils/emailService");
test.after(() => { global.fetch = realFetch; });
const last = () => sent[sent.length - 1];

test("código: asunto con el código, vista previa, texto plano y logo", async () => {
  await E.sendVerificationCode("ana@gmail.com", "482915", "Valentina Pérez");
  const m = last();
  assert.equal(m.subject, "482915 es tu código de Zyra");
  assert.match(m.htmlContent, /Úsalo en los próximos 10 minutos/);     // vista previa
  assert.match(m.htmlContent, /Imagenes\/logo-email\.png/);            // logo real, no emoji
  assert.match(m.htmlContent, /Hola, Valentina\./);                   // primer nombre
  assert.match(m.textContent, /482915/);                          // el código también en texto plano
  assert.doesNotMatch(m.htmlContent, /display:flex/);                   // Gmail/Outlook no lo entienden
});

test("bienvenida: promete lo que de verdad trae el plan Gratis", async () => {
  await E.sendWelcomeEmail("ana@gmail.com", "Valentina Pérez");
  const m = last();
  assert.match(m.htmlContent, /diario ilimitado/);
  assert.doesNotMatch(m.htmlContent, /10 entradas/);
  assert.match(m.htmlContent, /Línea 106/);
});

test("asunto: texto plano, sin '&amp;' ni saltos de línea", async () => {
  await E.sendSharedWeeklyReport("psico@gmail.com", "Dra. Martínez", "Ana & Juan\nPérez", { emotionData: {}, mainEmotion: "", weekOf: new Date(), html: "<p>Hola</p>" });
  const m = last();
  assert.match(m.subject, /^Ana & Juan Pérez compartió contigo/);
  assert.doesNotMatch(m.subject, /&amp;|\n/);
  assert.match(m.htmlContent, /Hola, Dra\. Martínez\. /);             // a un tercero, con su nombre completo
  assert.match(m.htmlContent, /Ana &amp; Juan Pérez/);                 // dentro del HTML sí se escapa
});

test("reporte: lo que escribe la IA no puede colar enlaces ni código", () => {
  const out = E._cleanReportHtml(`<p onclick="x()">Hola <a href="https://phishing.example">aquí</a></p><script>alert(1)</script><img src=x onerror=alert(1)><h3 class="t">Plan</h3><ul><li><strong>Respira</strong></li></ul>`);
  assert.doesNotMatch(out, /phishing|<script|onerror|onclick|<img|<a /);
  assert.match(out, /<h3 style="[^"]+">Plan<\/h3>/);
  assert.match(out, /<li style="[^"]+"><strong style="[^"]+">Respira<\/strong><\/li>/);
  assert.match(out, /aquí/);   // el texto queda, el enlace no
});

test("reporte semanal: fechas legibles y el pulso de la semana", async () => {
  await E.sendWeeklyReport("ana@gmail.com", "Valentina", "<p>Buena semana</p>", {
    topEmotion: "tranquilo", weekStart: new Date(Date.UTC(2026, 8, 28)), weekEnd: new Date(Date.UTC(2026, 9, 5)),
    positivity: 80, history: [1, 2, 3], completedGoals: [], heart: { restAvg: 72, goal: { text: "Camina 20 minutos." } },
  });
  const m = last();
  assert.match(m.subject, /28 de septiembre al 4 de octubre/);
  assert.match(m.htmlContent, />72</);
  assert.match(m.htmlContent, /Camina 20 minutos\./);
  assert.match(m.htmlContent, /\?p=weekly-report/);
});

test("crisis: al contacto no le llega el mensaje privado; a la persona, apoyo (no la alerta)", async () => {
  await E.sendCrisisAlert("mama@gmail.com", "Carmen", "Valentina", "texto privado de la persona");
  assert.doesNotMatch(last().htmlContent, /texto privado/);
  assert.match(last().subject, /Valentina podría necesitar tu apoyo/);
  await E.sendCrisisSupportEmail("vale@gmail.com", "Valentina Pérez");
  const m = last();
  assert.equal(m.subject, "Aquí estamos contigo 💙");
  assert.doesNotMatch(m.htmlContent, /te registró/);
  assert.match(m.htmlContent, /123/);
});

test("te extrañamos: botón de baja de un clic (List-Unsubscribe) y enlace firmado", async () => {
  await E.sendNudgeEmail("ana@gmail.com", "Vale", { days: 6, userId: "64f1a2b3c4d5e6f708192a3b" });
  const m = last();
  assert.equal(m.subject, "Vale, te extrañamos 💙");
  assert.match(m.headers["List-Unsubscribe"], /^<https:\/\/.+\/api\/email\/unsubscribe\?u=64f1a2b3c4d5e6f708192a3b&t=[0-9a-f]{32}>$/);
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(m.htmlContent, /Hace 6 días que no hablamos/);
  assert.match(m.textContent, /No quiero recibir más estos correos \(https:/);
});

test("cuentas de prueba: no se les manda nada", async () => {
  const before = sent.length;
  await E.sendNudgeEmail("qa@zyratest.com", "QA", { days: 5, userId: "64f1a2b3c4d5e6f708192a3b" });
  await E.sendWelcomeEmail("x@example.com", "X");
  assert.equal(sent.length, before);
});
