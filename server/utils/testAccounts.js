// Cuentas de prueba: las sesiones de QA crean usuarios con correo @zyratest.com,
// un dominio que no existe. No deben contar en las métricas del panel admin.
const QA_EMAIL_RE = /@zyratest\.com$/i;

// Dominios que nunca reciben correo: las cuentas QA y los reservados para pruebas
// (RFC 2606 / 6761). Enviarles solo produce rebotes, que dañan la reputación de
// envío en Brevo y pueden mandar a spam los códigos de los usuarios reales.
const NO_SEND_EMAIL_RE = /@(zyratest\.com|example\.(com|net|org)|[^@\s]+\.(test|invalid|example|localhost))$/i;

module.exports = { QA_EMAIL_RE, NO_SEND_EMAIL_RE };
