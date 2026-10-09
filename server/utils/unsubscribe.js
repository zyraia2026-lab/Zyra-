// Enlace para dejar de recibir el correo "te extrañamos" sin iniciar sesión. El enlace lleva
// una firma (HMAC con JWT_SECRET) para que nadie pueda dar de baja a otra persona adivinando IDs.
const crypto = require("crypto");

const BASE_URL = process.env.RENDER_EXTERNAL_URL || "https://zyra-app-8qva.onrender.com";

function unsubscribeToken(userId) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET || "zyra").update("unsub:" + String(userId)).digest("hex").slice(0, 32);
}

function unsubscribeUrl(userId) {
  return `${BASE_URL}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeToken(userId)}`;
}

function validUnsubscribe(userId, token) {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(String(token || ""));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

module.exports = { unsubscribeUrl, validUnsubscribe };
