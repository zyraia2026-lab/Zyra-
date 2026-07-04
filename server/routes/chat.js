const r = require("express").Router();
const { sendMessage } = require("../controllers/chatController");
const { protect }           = require("../middleware/auth");
const { safetyGuard }       = require("../middleware/safetyGuard");
const { checkMessageLimit } = require("../middleware/planGate");

r.post("/", protect, checkMessageLimit, safetyGuard, sendMessage);
module.exports = r;