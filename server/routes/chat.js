const r = require("express").Router();
const { sendMessage } = require("../controllers/chatController");
const { protect } = require("../middleware/auth");
const { safetyGuard } = require("../middleware/safetyGuard"); // 👈 línea nueva

r.post("/", protect, safetyGuard, sendMessage); // 👈 safetyGuard agregado
module.exports = r;