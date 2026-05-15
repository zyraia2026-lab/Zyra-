const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationCode = async (toEmail, code, userName = "") => {
  const mailOptions = {
    from: `"Zyra 🌊" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Tu código de verificación — Zyra",
    html: `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"/></head>
    <body style="margin:0;padding:0;background:#09090f;font-family:'Segoe UI',sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#12121e;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <div style="background:linear-gradient(135deg,#7c5cfc,#4a9eff);padding:32px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:28px;letter-spacing:-1px;">🌊 Zyra</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Bienestar Emocional con IA</p>
        </div>
        <div style="padding:36px 32px;text-align:center;">
          <p style="color:#a8a8c8;font-size:15px;margin:0 0 8px;">Hola${userName ? " <strong style='color:#f0f0ff'>" + userName + "</strong>" : ""}, tu código de verificación es:</p>
          <div style="background:rgba(124,92,252,0.1);border:2px solid rgba(124,92,252,0.4);border-radius:16px;padding:24px;margin:24px 0;">
            <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#f0f0ff;">${code}</span>
          </div>
          <p style="color:#5a5a7a;font-size:13px;margin:0;">Este código expira en <strong style="color:#a8a8c8;">10 minutos</strong>.</p>
          <p style="color:#5a5a7a;font-size:13px;margin:8px 0 0;">Si no solicitaste este código, ignora este mensaje.</p>
        </div>
        <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
          <p style="color:#3a3a5a;font-size:12px;margin:0;">© 2026 Zyra — Bienestar Emocional · zyra.ia.2026@gmail.com</p>
        </div>
      </div>
    </body>
    </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationCode };