const r           = require("express").Router();
const rateLimit   = require("express-rate-limit");
const {
  registerRequest, registerVerify,
  loginRequest,    loginVerify,
  resendCode,      getMe, updateSettings,
  updateProfile,   updatePassword,
  forgotPasswordRequest, forgotPasswordReset,
  acceptTerms,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Demasiados intentos. Espera 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

r.post("/register/request", authLimiter, registerRequest);
r.post("/register/verify",  authLimiter, registerVerify);
r.post("/login/request",    authLimiter, loginRequest);
r.post("/login/verify",     authLimiter, loginVerify);
r.post("/resend-code",      authLimiter, resendCode);
r.get("/me",                protect, getMe);
r.put("/settings",          protect, updateSettings);
r.put("/update-profile",    protect, updateProfile);
r.put("/update-password",   protect, updatePassword);
r.post("/forgot-password/request", authLimiter, forgotPasswordRequest);
r.post("/forgot-password/reset",   authLimiter, forgotPasswordReset);
r.post("/accept-terms",            protect, acceptTerms);

module.exports = r;