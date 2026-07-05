const r = require("express").Router();
const { protect } = require("../middleware/auth");
const T = require("../controllers/ttsController");

r.post("/speak",        protect, T.speak);
r.post("/audio",        protect, T.audio);
r.get("/video/:talkId", protect, T.pollVideo);

module.exports = r;
