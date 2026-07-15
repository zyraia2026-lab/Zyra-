const jwt  = require("jsonwebtoken");
const User = require("../models/User");
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer"))
    token = req.headers.authorization.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No autorizado" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).lean();
    if (!req.user) return res.status(401).json({ message: "Usuario no encontrado" });
    if (req.user.isDisabled) return res.status(403).json({ message: "Cuenta suspendida. Contacta soporte.", disabled: true });
    next();
  } catch { return res.status(401).json({ message: "Token invalido" }); }
};
module.exports = { protect };