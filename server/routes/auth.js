const r = require("express").Router();
const {
  registerRequest, registerVerify,
  loginRequest,    loginVerify,
  resendCode,      getMe, updateSettings
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

r.post("/register/request", registerRequest);
r.post("/register/verify",  registerVerify);
r.post("/login/request",    loginRequest);
r.post("/login/verify",     loginVerify);
r.post("/resend-code",      resendCode);
r.get("/me",                protect, getMe);
r.put("/settings",          protect, updateSettings);

// ── NUEVAS LÍNEAS ──
r.put("/update-profile",  protect, require("../controllers/authController").updateProfile);
r.put("/update-password", protect, require("../controllers/authController").updatePassword);

module.exports = r;