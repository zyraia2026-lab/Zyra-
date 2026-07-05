const r = require("express").Router();
const { protect } = require("../middleware/auth");
const P = require("../controllers/pushController");

r.get("/key",           P.getPublicKey);
r.post("/subscribe",    protect, P.subscribe);
r.delete("/subscribe",  protect, P.unsubscribe);

module.exports = r;
