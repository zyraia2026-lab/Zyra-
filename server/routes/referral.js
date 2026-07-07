const r = require("express").Router();
const { protect } = require("../middleware/auth");
const R = require("../controllers/referralController");

r.get("/info",  protect, R.getInfo);
r.post("/apply", protect, R.applyCode);

module.exports = r;
