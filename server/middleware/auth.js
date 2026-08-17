const jwt  = require("jsonwebtoken");
const User = require("../models/User");
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer"))
    token = req.headers.authorization.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No autorizado" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("name email plan planExpiresAt isDisabled messagesUsedToday messagesResetAt +passwordChangedAt").lean();
    if (!req.user) return res.status(401).json({ message: "Usuario no encontrado" });
    if (req.user.isDisabled) return res.status(403).json({ message: "Cuenta suspendida. Contacta soporte.", disabled: true });
    // Si la contraseña cambió después de que se emitió este token, ya no sirve —
    // así un token robado deja de funcionar apenas la víctima cambia su clave.
    if (req.user.passwordChangedAt && decoded.iat * 1000 < new Date(req.user.passwordChangedAt).getTime()) {
      return res.status(401).json({ message: "Tu sesión expiró porque la contraseña cambió. Inicia sesión de nuevo." });
    }
    delete req.user.passwordChangedAt;
    next();
  } catch { return res.status(401).json({ message: "Token invalido" }); }
};
module.exports = { protect };