const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { getOverview } = require("../controllers/analyticsController");

r.get("/", protect, getOverview);

module.exports = r;
