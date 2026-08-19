const r = require("express").Router();
const { protect } = require("../middleware/auth");
const V = require("../controllers/voiceController");

r.post("/start",   protect, V.startCall);
r.post("/discard", protect, V.discardCall);

module.exports = r;
