const User    = require("../models/User");
const Profile = require("../models/Profile");
const OTP     = require("../models/OTPCode");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const { sendVerificationCode, sendWelcomeEmail, sendPasswordResetCode } = require("../utils/emailService");

const tk = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || "7d" });
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const expiresAt = () => new Date(Date.now() + 10 * 60 * 1000);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const isValidEmail = (e) => EMAIL_RE.test(String(e || "").toLowerCase());

async function saveOTP(key, code, data = {}) {
  await OTP.findOneAndUpdate(
    { key },
    { key, email: data.email || key.replace("reset_",""), code, expires: expiresAt(), data },
    { upsert: true, new: true }
  );
}

async function verifyOTP(key, code) {
  const otp = await OTP.findOne({ key });
  if (!otp)                      return { error: "No hay un código pendiente para este correo" };
  if (new Date() > otp.expires)  { await OTP.deleteOne({ key }); return { error: "El código expiró. Intenta de nuevo" }; }
  if (otp.code !== code.trim())  return { error: "Código incorrecto. Inténtalo de nuevo" };
  await OTP.deleteOne({ key });
  return { data: otp.data };
}

// ── PASO 1 REGISTRO ──
exports.registerRequest = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Todos los campos son requeridos" });
    if (String(name).trim().length > 100)
      return res.status(400).json({ message: "El nombre es demasiado largo (máx. 100 caracteres)" });
    if (!isValidEmail(email))
      return res.status(400).json({ message: "Formato de correo inválido" });
    if (password.length < 8)
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    if (password.length > 128)
      return res.status(400).json({ message: "La contraseña es demasiado larga" });
    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Este correo ya está registrado" });

    const code = generateCode();
    const hashedPassword = await bcrypt.hash(password, 12);
    await saveOTP(email, code, { email, name: String(name).trim(), password: hashedPassword, prehashed: true });
    sendVerificationCode(email, code, String(name).trim()).catch(e => console.error("[email] registerRequest:", e.message));
    res.json({ success: true, message: "Código enviado a tu correo" });
  } catch (e) {
    console.error("registerRequest:", e.message);
    res.status(500).json({ message: "Error al enviar el código. Inténtalo de nuevo." });
  }
};

// ── PASO 2 REGISTRO ──
exports.registerVerify = async (req, res) => {
  try {
    const { email, code } = req.body;
    const result = await verifyOTP(email, code);
    if (result.error) return res.status(400).json({ message: result.error });

    const { name, password, prehashed } = result.data;
    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Este correo ya está registrado" });

    const genCode = () => "ZYRA" + Math.random().toString(36).slice(2,8).toUpperCase();
    let referralCode = genCode();
    while (await User.exists({ referralCode })) referralCode = genCode();
    const userDoc = new User({ name, email, password, referralCode });
    if (prehashed) userDoc._prehashed = true;
    const user = await userDoc.save();
    await Profile.create({ user: user._id });

    // Email de bienvenida (fire-and-forget)
    sendWelcomeEmail(email, name).catch(() => {});

    res.status(201).json({
      success: true,
      token: tk(user._id),
      user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode, termsAcceptedAt: user.termsAcceptedAt }
    });
  } catch (e) {
    console.error("registerVerify:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── PASO 1 LOGIN ──
exports.loginRequest = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email y contraseña requeridos" });
    if (!isValidEmail(email))
      return res.status(400).json({ message: "Formato de correo inválido" });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: "Credenciales incorrectas" });

    const code = generateCode();
    await saveOTP(`login_${email}`, code, { email, userId: user._id.toString() });
    sendVerificationCode(email, code, user.name).catch(e => console.error("[email] loginRequest:", e.message));
    res.json({ success: true, message: "Código enviado a tu correo" });
  } catch (e) {
    console.error("loginRequest:", e.message);
    res.status(500).json({ message: "Error al enviar el código. Inténtalo de nuevo." });
  }
};

// ── PASO 2 LOGIN ──
exports.loginVerify = async (req, res) => {
  try {
    const { email, code } = req.body;
    const result = await verifyOTP(`login_${email}`, code);
    if (result.error) return res.status(400).json({ message: result.error });

    const { userId } = result.data;
    if (!userId) return res.status(400).json({ message: "Proceso de login inválido. Intenta de nuevo" });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

    res.json({
      success: true,
      token: tk(user._id),
      user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode, termsAcceptedAt: user.termsAcceptedAt }
    });
  } catch (e) {
    console.error("loginVerify:", e.message);
    res.status(500).json({ message: "Error al verificar el código. Inténtalo de nuevo." });
  }
};

// ── REENVIAR CÓDIGO ──
exports.resendCode = async (req, res) => {
  try {
    const { email } = req.body;
    // Buscar OTP existente (registro o login)
    const existing = await OTP.findOne({ email, key: { $in: [email, `login_${email}`] } });
    if (!existing) return res.status(400).json({ message: "No hay un proceso pendiente para este correo" });

    const code = generateCode();
    await OTP.findOneAndUpdate({ key: existing.key }, { code, expires: expiresAt() });
    await sendVerificationCode(email, code, existing.data?.name || "");
    res.json({ success: true, message: "Código reenviado" });
  } catch (e) {
    console.error("resendCode:", e.message);
    res.status(500).json({ message: "Error al reenviar el código. Inténtalo de nuevo." });
  }
};

// ── GET ME ──
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const isAdmin = !!(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode, isAdmin } });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE SETTINGS ──
exports.updateSettings = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id, { darkMode: req.body.darkMode }, { new: true }
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, darkMode: user.darkMode } });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE PROFILE ──
exports.updateProfile = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "El nombre es requerido" });
    if (name.length > 100) return res.status(400).json({ message: "El nombre es demasiado largo (máx. 100 caracteres)" });
    const user = await User.findByIdAndUpdate(
      req.user._id, { name }, { new: true }
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

// ── UPDATE PASSWORD (requiere contraseña actual) ──
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, password } = req.body;
    if (!currentPassword || !password)
      return res.status(400).json({ message: "Se requieren la contraseña actual y la nueva" });
    if (password.length < 8)
      return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 8 caracteres" });
    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!(await user.matchPassword(currentPassword)))
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    user.password = password;
    await user.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: "Error al actualizar la contraseña. Inténtalo de nuevo." }); }
};

// ── OLVIDÉ MI CONTRASEÑA — Paso 1 ──
exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email requerido" });
    const user = await User.findOne({ email });
    if (user) {
      const code = generateCode();
      await saveOTP(`reset_${email}`, code, { email, userId: user._id.toString() });
      sendPasswordResetCode(email, code, user.name).catch(e => console.error("[email] forgotPassword:", e.message));
    }
    res.json({ success: true, message: "Si ese correo existe, recibirás un código" });
  } catch(e) {
    console.error("forgotPasswordRequest:", e.message);
    res.status(500).json({ message: "Error al procesar la solicitud. Inténtalo de nuevo." });
  }
};

// ── OLVIDÉ MI CONTRASEÑA — Paso 2 ──
exports.forgotPasswordReset = async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password)
      return res.status(400).json({ message: "Todos los campos son requeridos" });
    if (password.length < 8)
      return res.status(400).json({ message: "Mínimo 8 caracteres en la contraseña" });

    const result = await verifyOTP(`reset_${email}`, code);
    if (result.error) return res.status(400).json({ message: result.error });

    const user = await User.findById(result.data.userId).select("+password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    user.password = password;
    await user.save();
    res.json({ success: true, message: "Contraseña actualizada correctamente" });
  } catch(e) {
    console.error("forgotPasswordReset:", e.message);
    res.status(500).json({ message: "Error al actualizar la contraseña. Inténtalo de nuevo." });
  }
};

// ── ACEPTAR TÉRMINOS Y CONDICIONES ──
exports.acceptTerms = async (req, res) => {
  try {
    const TERMS_VERSION = "v1.1-2026-07";
    await User.findByIdAndUpdate(req.user._id, {
      termsAcceptedAt: new Date(),
      termsAcceptedVersion: TERMS_VERSION,
    });
    res.json({ success: true, termsAcceptedAt: new Date(), version: TERMS_VERSION });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};
