const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");
const { checkCargas } = require("../middleware/cargasGate");
const { generate, getHistory, getOne } = require("../controllers/weeklyReportController");

r.post("/generate",    protect, requirePlan("basic"), checkCargas(5), generate);
r.get("/history",      protect, requirePlan("basic"), getHistory);
r.get("/:id",          protect, requirePlan("basic"), getOne);

module.exports = r;
