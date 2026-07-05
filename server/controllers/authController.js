const User    = require("../models/User");
const Profile = require("../models/Profile");
const jwt     = require("jsonwebtoken");
const { sendVerificationCode } = require("../utils/emailService");

// En memoria (local/dev). Mejor limpiarlo para evitar acumulación y estados rotos.
const pendingCodes = {};

const tk = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || "7d" });
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

function cleanupPendingCodes() {
  const now = Date.now();
  for (const [email, pending] of Object.entries(pendingCodes)) {
    if (!pending?.expires || now > pending.expires) delete pendingCodes[email];
  }
}

// ── PASO 1 REGISTRO ──
exports.registerRequest = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Todos los campos son requeridos" });
    if (password.length < 6)
      return res.status(400).json({ message: "Mínimo 6 caracteres en la contraseña" });
    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Este correo ya está registrado" });

    const code    = generateCode();
    const expires = Date.now() + 10 * 60 * 1000;
    pendingCodes[email] = { code, expires, userData: { name, email, password } };

    await sendVerificationCode(email, code, name);
    res.json({ success: true, message: "Código enviado a tu correo" });
  } catch (e) {
    console.error("Error registerRequest:", e.message);
    res.status(500).json({ message: "Error al enviar el código: " + e.message });
  }
};

// ── PASO 2 REGISTRO ──
exports.registerVerify = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email, code } = req.body;
    const pending = pendingCodes[email];

    if (!pending)
      return res.status(400).json({ message: "No hay un código pendiente para este correo" });
    if (Date.now() > pending.expires) {
      delete pendingCodes[email];
      return res.status(400).json({ message: "El código expiró. Intenta registrarte de nuevo" });
    }
    if (pending.code !== code.trim())
      return res.status(400).json({ message: "Código incorrecto. Inténtalo de nuevo" });

    delete pendingCodes[email];
    const { name, password } = pending.userData;

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Este correo ya está registrado" });

    const user = await User.create({ name, email, password });
    await Profile.create({ user: user._id });

    res.status(201).json({
      success: true,
      token: tk(user._id),
      user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode }
    });
  } catch (e) {
    console.error("Error registerVerify:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── PASO 1 LOGIN ──
exports.loginRequest = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email y contraseña requeridos" });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: "Credenciales incorrectas" });

    const code    = generateCode();
    const expires = Date.now() + 10 * 60 * 1000;
    pendingCodes[email] = { code, expires, userId: user._id };

    await sendVerificationCode(email, code, user.name);
    res.json({ success: true, message: "Código enviado a tu correo" });
  } catch (e) {
    console.error("Error loginRequest:", e.message);
    res.status(500).json({ message: "Error al enviar el código: " + e.message });
  }
};

// ── PASO 2 LOGIN ──
exports.loginVerify = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email, code } = req.body;
    const pending = pendingCodes[email];

    if (!pending)
      return res.status(400).json({ message: "No hay un código pendiente para este correo" });
    if (Date.now() > pending.expires) {
      delete pendingCodes[email];
      return res.status(400).json({ message: "El código expiró. Intenta iniciar sesión de nuevo" });
    }
    if (pending.code !== code.trim())
      return res.status(400).json({ message: "Código incorrecto. Inténtalo de nuevo" });

    delete pendingCodes[email];

    if (!pending.userId)
      return res.status(400).json({ message: "Proceso de login inválido. Intenta iniciar sesión de nuevo" });

    const user = await User.findById(pending.userId);
    if (!user)
      return res.status(401).json({ message: "Usuario no encontrado. Inicia sesión nuevamente" });

    res.json({
      success: true,
      token: tk(user._id),
      user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode }
    });
  } catch (e) {
    console.error("Error loginVerify:", e);
    res.status(500).json({ message: "Error loginVerify: " + (e?.message || "desconocido") });
  }
};

// ── REENVIAR CÓDIGO ──
exports.resendCode = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email } = req.body;
    const pending   = pendingCodes[email];

    if (!pending)
      return res.status(400).json({ message: "No hay un proceso pendiente para este correo" });

    const code    = generateCode();
    const expires = Date.now() + 10 * 60 * 1000;
    pending.code    = code;
    pending.expires = expires;

    const name = pending.userData?.name || "";
    await sendVerificationCode(email, code, name);
    res.json({ success: true, message: "Código reenviado" });
  } catch (e) {
    res.status(500).json({ message: "Error al reenviar: " + e.message });
  }
};

// ── GET ME ──
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode } });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE SETTINGS ──
exports.updateSettings = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id, { darkMode: req.body.darkMode }, { new: true }
    );
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode } });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE PROFILE ──
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id, { name: req.body.name }, { new: true }
    );
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE PASSWORD ──
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, password } = req.body;
    if (!currentPassword || !password)
      return res.status(400).json({ message: "Se requieren la contraseña actual y la nueva" });
    if (password.length < 6)
      return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 6 caracteres" });
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.matchPassword(currentPassword)))
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    user.password = password;
    await user.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

// ── OLVIDÉ MI CONTRASEÑA — Paso 1: enviar código ──
exports.forgotPasswordRequest = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email requerido" });
    const user = await User.findOne({ email });
    // Responder igual aunque no exista (evitar user enumeration)
    if (user) {
      const code    = generateCode();
      const expires = Date.now() + 10 * 60 * 1000;
      pendingCodes[`reset_${email}`] = { code, expires, userId: user._id };
      await sendVerificationCode(email, code, user.name, "reset");
    }
    res.json({ success: true, message: "Si ese correo existe, recibirás un código" });
  } catch(e) {
    console.error("forgotPasswordRequest:", e.message);
    res.status(500).json({ message: "Error al enviar código" });
  }
};

// ── OLVIDÉ MI CONTRASEÑA — Paso 2: verificar código y cambiar contraseña ──
exports.forgotPasswordReset = async (req, res) => {
  try {
    cleanupPendingCodes();
    const { email, code, password } = req.body;
    if (!email || !code || !password)
      return res.status(400).json({ message: "Todos los campos son requeridos" });
    if (password.length < 6)
      return res.status(400).json({ message: "Mínimo 6 caracteres en la contraseña" });

    const key     = `reset_${email}`;
    const pending = pendingCodes[key];
    if (!pending)
      return res.status(400).json({ message: "No hay un código pendiente para este correo" });
    if (Date.now() > pending.expires) {
      delete pendingCodes[key];
      return res.status(400).json({ message: "El código expiró. Solicita uno nuevo" });
    }
    if (pending.code !== code.trim())
      return res.status(400).json({ message: "Código incorrecto" });

    delete pendingCodes[key];
    const user = await User.findById(pending.userId).select("+password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    user.password = password;
    await user.save();
    res.json({ success: true, message: "Contraseña actualizada correctamente" });
  } catch(e) {
    console.error("forgotPasswordReset:", e.message);
    res.status(500).json({ message: e.message });
  }
};
